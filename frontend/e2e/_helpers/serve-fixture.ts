// Shared ogdb-serve fixture for claim specs.
//
// Lifts the beforeAll / afterAll block from rdf-import-real.spec.ts so every
// claim spec in e2e/claims/ uses an identical lifecycle:
//   - ensure the release binary exists (build if missing)
//   - spawn `ogdb serve --http --port <PORT> <tempdb>` against a fresh tempdir
//   - wait for /health to report ok
//   - hand the spec the baseUrl, dbPath, and a helper to seed RDF/TTL via /rdf/import
//   - tear the process down and remove the tempdir
//
// Each claim spec calls `const ctx = useOgdbServeFixture()` at the top of its
// describe block; the fixture owns the beforeAll/afterAll hooks and exposes a
// ctx object so tests can await `ctx.seedTurtle(...)` or read `ctx.dbPath`.

import { test, type TestType } from '@playwright/test'
import { spawn, spawnSync } from 'child_process'
import type { ChildProcess } from 'child_process'
import { mkdtempSync, rmSync, existsSync, chmodSync } from 'fs'
import { createServer } from 'net'
import { tmpdir } from 'os'
import { join } from 'path'

// Confirm the requested port is free *before* spawning ogdb, so a leftover
// process bound to the same port (e.g. a forgotten `ogdb demo` from a prior
// session) can't silently win the race against /health and end up answering
// the spec's queries. Throws with a precise message naming the port.
async function assertPortFree(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const probe = createServer()
    probe.unref()
    probe.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(
          new Error(
            `serve fixture: port ${port} is already in use — refuse to spawn ogdb against an unknown server. ` +
              `Run \`ss -tlnp | grep :${port}\` to find the rogue process.`,
          ),
        )
      } else {
        reject(err)
      }
    })
    probe.once('listening', () => probe.close(() => resolve()))
    probe.listen(port, '127.0.0.1')
  })
}

// Bind a transient TCP server to port 0 on 127.0.0.1, capture the OS-chosen
// port, then close. Used when the caller didn't pin a port — every spec gets
// a fresh OS-allocated port instead of all racing for the same hard-coded
// 8080. The brief window between `close()` and `ogdb serve` re-binding is
// the only TOCTOU here, and is fine for our serial-workers test config.
async function allocateEphemeralPort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const probe = createServer()
    probe.unref()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const addr = probe.address()
      if (addr === null || typeof addr === 'string') {
        probe.close()
        reject(new Error('serve fixture: failed to read ephemeral port from probe.address()'))
        return
      }
      const port = addr.port
      probe.close(() => resolve(port))
    })
  })
}

// Playwright's cwd during the run is the `frontend/` directory (playwright.config.ts
// lives there). The repo root sits one directory above.
export const REPO_ROOT = join(process.cwd(), '..')
export const OGDB_BIN = join(REPO_ROOT, 'target', 'release', 'ogdb')

// Specs that go through the Vite /api proxy must pin port 8080 (the proxy
// target is hard-coded in vite.config.app.ts). Specs that fetch the API
// directly via `serve.apiBase` should leave port unset and let the fixture
// pick an OS-allocated ephemeral port — that way two spec files can run in
// parallel without manually coordinating a free port.
export interface ServeFixtureOptions {
  port?: number
}

export interface ServeFixtureHandle {
  /** The base URL a browser should talk to — always goes through the Vite /api proxy. */
  readonly apiBase: string
  /** Absolute path to the tempdir .ogdb file the server opened. */
  readonly dbPath: string
  /** Absolute port the server is bound to (the resolved port, even when ephemeral). */
  readonly port: number
  /** POST a TTL string to /rdf/import and resolve with the parsed JSON response. */
  seedTurtle(ttl: string): Promise<{
    ok: boolean
    imported_nodes: number
    imported_edges: number
    db_path: string
  }>
  /** POST a Cypher query to /query and resolve with the parsed JSON response. */
  runCypher(query: string): Promise<unknown>
}

function ensureReleaseBinary(): void {
  if (existsSync(OGDB_BIN)) {
    try {
      chmodSync(OGDB_BIN, 0o755)
    } catch {
      /* best effort — only matters on Linux runners */
    }
    return
  }
  // Per-crate build so we never accidentally trigger a workspace-wide compile.
  const build = spawnSync('cargo', ['build', '--release', '-p', 'ogdb-cli'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  })
  if (build.status !== 0) {
    throw new Error(`cargo build --release -p ogdb-cli failed with status ${build.status}`)
  }
  if (!existsSync(OGDB_BIN)) {
    throw new Error(`expected release binary at ${OGDB_BIN} after build — not found`)
  }
}

async function waitForHealthy(healthUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastErr: unknown = null
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(healthUrl)
      if (resp.status === 200) {
        const body = (await resp.json()) as { status?: string }
        if (body.status === 'ok') return
      }
    } catch (err) {
      lastErr = err
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(
    `ogdb serve --http did not become healthy within ${timeoutMs}ms ` +
      `(${healthUrl}, last err: ${String(lastErr)})`,
  )
}

/**
 * Install beforeAll/afterAll hooks that spawn a real `ogdb serve --http` for the
 * surrounding test.describe block and return a handle with helper methods.
 *
 * Usage:
 *   test.describe('my claim', () => {
 *     const serve = useOgdbServeFixture({ port: 18091 })
 *     test('does the thing', async ({ page }) => {
 *       await serve.seedTurtle('@prefix ex: <...> . ex:a a ex:B .')
 *       ...
 *     })
 *   })
 */
export function useOgdbServeFixture(
  opts: ServeFixtureOptions = {},
  testInstance: TestType<object, object> = test,
): ServeFixtureHandle {
  const requestedPort = opts.port

  // Resolved at beforeAll time. When the caller pins a port we use it
  // directly; otherwise we allocate an OS-chosen ephemeral port. Tests
  // read the resolved value through handle.apiBase / handle.port — both
  // of which throw if accessed before beforeAll has run.
  let resolvedPort = 0
  let apiBase = ''
  let healthUrl = ''

  let serveProc: ChildProcess | null = null
  let serveDir: string | null = null
  let serveDbPath = ''

  const handle: ServeFixtureHandle = {
    get apiBase() {
      if (!apiBase) {
        throw new Error('serve fixture: apiBase requested before beforeAll ran')
      }
      return apiBase
    },
    get dbPath() {
      if (!serveDbPath) {
        throw new Error('serve fixture: dbPath requested before beforeAll ran')
      }
      return serveDbPath
    },
    get port() {
      if (!resolvedPort) {
        throw new Error('serve fixture: port requested before beforeAll ran')
      }
      return resolvedPort
    },
    async seedTurtle(ttl) {
      if (!apiBase) {
        throw new Error('serve fixture: seedTurtle called before beforeAll ran')
      }
      const resp = await fetch(`${apiBase}/rdf/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/turtle' },
        body: ttl,
      })
      if (!resp.ok) {
        throw new Error(`seedTurtle: /rdf/import returned HTTP ${resp.status}`)
      }
      const body = (await resp.json()) as {
        ok: boolean
        imported_nodes: number
        imported_edges: number
        db_path: string
      }
      if (!body.ok) {
        throw new Error(`seedTurtle: import reported !ok: ${JSON.stringify(body)}`)
      }
      return body
    },
    async runCypher(query) {
      if (!apiBase) {
        throw new Error('serve fixture: runCypher called before beforeAll ran')
      }
      const resp = await fetch(`${apiBase}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(`runCypher: HTTP ${resp.status}: ${text}`)
      }
      return resp.json()
    },
  }

  // Give ourselves headroom for a cold `cargo build --release -p ogdb-cli` on
  // a fresh worktree. The default beforeAll timeout is 30s which is too tight
  // if the binary has to be built from scratch.
  //
  // Playwright requires the first argument of beforeAll to use the object-
  // destructuring pattern (it inspects the function source to decide which
  // fixtures to inject). `(_, testInfo)` throws at runtime with
  // "First argument must use the object destructuring pattern: _" — so we
  // keep the empty-destructure form and silence eslint's no-empty-pattern.
  // eslint-disable-next-line no-empty-pattern
  testInstance.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(180_000)
    ensureReleaseBinary()

    if (requestedPort !== undefined) {
      // Reject before spawn rather than racing /health against an unrelated server.
      await assertPortFree(requestedPort)
      resolvedPort = requestedPort
    } else {
      resolvedPort = await allocateEphemeralPort()
    }
    apiBase = `http://127.0.0.1:${resolvedPort}`
    healthUrl = `${apiBase}/health`

    serveDir = mkdtempSync(join(tmpdir(), 'ogdb-claim-'))
    serveDbPath = join(serveDir, 'live.ogdb')

    serveProc = spawn(
      OGDB_BIN,
      ['serve', '--http', '--port', String(resolvedPort), serveDbPath],
      { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
    )

    const earlyExit = new Promise<never>((_, reject) => {
      serveProc!.once('exit', (code: number | null, signal: NodeJS.Signals | null) => {
        reject(new Error(`ogdb serve exited before healthy (code=${code}, signal=${signal})`))
      })
    })

    await Promise.race([waitForHealthy(healthUrl, 20_000), earlyExit])
  })

  testInstance.afterAll(async () => {
    if (serveProc && !serveProc.killed) {
      serveProc.kill('SIGTERM')
      await new Promise((r) => setTimeout(r, 300))
      if (!serveProc.killed) serveProc.kill('SIGKILL')
    }
    serveProc = null
    if (serveDir) {
      try {
        rmSync(serveDir, { recursive: true, force: true })
      } catch {
        /* best effort */
      }
    }
    serveDir = null
    serveDbPath = ''
    resolvedPort = 0
    apiBase = ''
    healthUrl = ''
  })

  return handle
}

/**
 * A minimal TTL fixture that produces 3 Person nodes and 3 knows edges, with a
 * namespace tag so repeated seeds against a shared DB don't collide on URIs.
 *
 * Any claim spec that just needs "some graph exists" can call:
 *   await serve.seedTurtle(samplePeopleTurtle('run-tag'))
 */
export function samplePeopleTurtle(tag: string): string {
  return `@prefix ex: <http://example.org/${tag}/> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .

ex:alice a foaf:Person ; foaf:name "Alice" ; foaf:knows ex:bob .
ex:bob   a foaf:Person ; foaf:name "Bob"   ; foaf:knows ex:alice .
ex:carol a foaf:Person ; foaf:name "Carol" ; foaf:knows ex:alice .
`
}
