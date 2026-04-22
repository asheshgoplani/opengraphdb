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
import { tmpdir } from 'os'
import { join } from 'path'

// Playwright's cwd during the run is the `frontend/` directory (playwright.config.ts
// lives there). The repo root sits one directory above.
export const REPO_ROOT = join(process.cwd(), '..')
export const OGDB_BIN = join(REPO_ROOT, 'target', 'release', 'ogdb')

// Every claim spec picks its own port so parallel spec files (if ever enabled)
// don't collide. Playwright's workers default to 1 here, but we keep the API
// explicit so a future bump doesn't silently break.
export interface ServeFixtureOptions {
  port: number
}

export interface ServeFixtureHandle {
  /** The base URL a browser should talk to — always goes through the Vite /api proxy. */
  readonly apiBase: string
  /** Absolute path to the tempdir .ogdb file the server opened. */
  readonly dbPath: string
  /** Absolute port the server is bound to (same as options.port). */
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
  opts: ServeFixtureOptions,
  testInstance: TestType<object, object> = test,
): ServeFixtureHandle {
  const { port } = opts
  const apiBase = `http://127.0.0.1:${port}`
  const healthUrl = `${apiBase}/health`

  let serveProc: ChildProcess | null = null
  let serveDir: string | null = null
  let serveDbPath = ''

  const handle: ServeFixtureHandle = {
    get apiBase() {
      return apiBase
    },
    get dbPath() {
      if (!serveDbPath) {
        throw new Error('serve fixture: dbPath requested before beforeAll ran')
      }
      return serveDbPath
    },
    port,
    async seedTurtle(ttl) {
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
  testInstance.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(180_000)
    ensureReleaseBinary()

    serveDir = mkdtempSync(join(tmpdir(), 'ogdb-claim-'))
    serveDbPath = join(serveDir, 'live.ogdb')

    serveProc = spawn(
      OGDB_BIN,
      ['serve', '--http', '--port', String(port), serveDbPath],
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
