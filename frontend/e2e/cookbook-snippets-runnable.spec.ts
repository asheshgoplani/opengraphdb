// RED-phase failing test for `documentation/COOKBOOK.md`. Mirrors the bring-up pattern
// from `frontend/e2e/rdf-import-real.spec.ts`: spawns a release `ogdb` against
// a fresh tmp `.ogdb`, healthchecks, exercises every HTTP snippet the cookbook
// promises is runnable. The whole describe block skips in CI when the release
// binary is absent — locally `ensureReleaseBinary()` builds it on demand.
//
// Until `documentation/COOKBOOK.md` lands the `cookbook doc exists` test fails outright
// and the per-recipe content checks short-circuit on the missing file. After
// Phase 8 of `.planning/ai-agent-cookbook/PLAN.md` ships, every test passes.

import { expect, test } from '@playwright/test'
import { spawn, spawnSync } from 'child_process'
import type { ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, chmodSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Playwright's cwd during `npx playwright test` is the `frontend/` directory
// (playwright.config.ts lives there). The repo root sits one directory above.
const REPO_ROOT = join(process.cwd(), '..')
const OGDB_BIN = join(REPO_ROOT, 'target', 'release', 'ogdb')
const COOKBOOK_PATH = join(REPO_ROOT, 'documentation', 'COOKBOOK.md')

const SERVE_PORT = 8181
const HEALTH_URL = `http://127.0.0.1:${SERVE_PORT}/health`
const BASE_URL = `http://127.0.0.1:${SERVE_PORT}`

// CI without the binary in cache → skip the whole describe. Locally, we build
// it lazily in beforeAll. The escape hatch `OGDB_E2E_LIVE=1` forces a build
// even on CI.
const SKIP =
  process.env.CI === 'true' &&
  !existsSync(OGDB_BIN) &&
  process.env.OGDB_E2E_LIVE !== '1'

let serveProc: ChildProcessWithoutNullStreams | null = null
let serveDir: string | null = null
let serveDbPath: string | null = null

function ensureReleaseBinary(): void {
  if (existsSync(OGDB_BIN)) {
    try {
      chmodSync(OGDB_BIN, 0o755)
    } catch {
      /* best effort */
    }
    return
  }
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

async function waitForHealthy(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastErr: unknown = null
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(HEALTH_URL)
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
    `ogdb serve --http did not become healthy within ${timeoutMs}ms (last err: ${String(lastErr)})`,
  )
}

function readCookbook(): string {
  if (!existsSync(COOKBOOK_PATH)) {
    throw new Error(`documentation/COOKBOOK.md does not exist at ${COOKBOOK_PATH}`)
  }
  return readFileSync(COOKBOOK_PATH, 'utf-8')
}

async function postJson(path: string, body: unknown): Promise<{ status: number; json: unknown }> {
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  // Some routes can return 204 / non-JSON on error; tolerate that.
  let json: unknown = null
  try {
    json = await resp.json()
  } catch {
    json = null
  }
  return { status: resp.status, json }
}

test.describe('cookbook snippets — runnable against ogdb serve --http', () => {
  // Conditional skip: when CI lacks the release binary, every test in this
  // describe is skipped at runtime. Locally (or with OGDB_E2E_LIVE=1) the
  // tests run and exercise the live backend.
  test.skip(SKIP, 'release binary missing in CI; set OGDB_E2E_LIVE=1 to force')

  test.beforeAll(async () => {
    ensureReleaseBinary()

    serveDir = mkdtempSync(join(tmpdir(), 'cookbook-e2e-'))
    serveDbPath = join(serveDir, 'cookbook.ogdb')

    serveProc = spawn(
      OGDB_BIN,
      ['serve', '--http', '--port', String(SERVE_PORT), serveDbPath],
      { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
    )

    const earlyExit = new Promise<never>((_, reject) => {
      serveProc!.once('exit', (code: number | null, signal: NodeJS.Signals | null) => {
        reject(new Error(`ogdb serve exited before healthy (code=${code}, signal=${signal})`))
      })
    })

    await Promise.race([waitForHealthy(15_000), earlyExit])
  })

  test.afterAll(async () => {
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
    serveDbPath = null
  })

  test('cookbook doc exists with all 7 recipe headings', () => {
    const body = readCookbook()
    // The 7 recipe titles must each appear verbatim. Wording is locked by PLAN.md
    // Section A so the spec and the doc cannot drift independently.
    const requiredTitles = [
      'AI-agent over MCP',
      'Hybrid retrieval',
      'Ingest a doc',
      'Time-travel',
      'Skill-quality eval',
      'Migrate from Neo4j',
      'Detect knowledge-graph regressions in CI',
    ]
    for (const title of requiredTitles) {
      expect(body, `cookbook must mention "${title}"`).toContain(title)
    }
  })

  test('setup section: GET /health returns ok', async () => {
    readCookbook() // gate on doc existing
    const resp = await fetch(HEALTH_URL)
    expect(resp.status).toBe(200)
    const json = (await resp.json()) as { status?: string }
    expect(json.status).toBe('ok')
  })

  test('recipe 1: POST /mcp/tools returns the documented tool catalog', async () => {
    readCookbook()
    const { status, json } = await postJson('/mcp/tools', {})
    expect(status).toBe(200)
    const tools =
      (json as { tools?: { name?: string; description?: string }[] } | null)?.tools ?? []
    const names = tools.map((t) => t.name).filter((n): n is string => typeof n === 'string')
    for (const required of [
      'execute_cypher',
      'browse_schema',
      'vector_search',
      'temporal_diff',
      'rag_retrieve',
    ]) {
      expect(names, `tool catalog must include ${required}`).toContain(required)
    }
    // C2-H5 regression: every tool must carry a non-empty description.
    // Cycle 1 shipped the cookbook with `"description": "..."` placeholders for
    // all 20 entries; this assertion blocks that from re-shipping.
    for (const tool of tools) {
      const desc = tool.description ?? ''
      expect(desc.length, `tool ${tool.name ?? '<unnamed>'} must have a non-empty description`).toBeGreaterThan(0)
      expect(desc, `tool ${tool.name ?? '<unnamed>'} description must not be a placeholder`).not.toMatch(/^\.\.\.+$/)
    }
  })

  test('recipe 1: POST /mcp/invoke browse_schema returns 200', async () => {
    readCookbook()
    // /mcp/invoke takes the flat tool-call shape — top-level `name` +
    // `arguments`, NOT a JSON-RPC envelope. See `handle_http_mcp_invoke` in
    // `crates/ogdb-cli/src/lib.rs:4804`.
    const { status, json } = await postJson('/mcp/invoke', {
      name: 'browse_schema',
      arguments: {},
    })
    expect(status).toBe(200)
    expect(json, 'browse_schema response must be JSON').not.toBeNull()
  })

  test('recipe 2: POST /rag/search on empty DB returns 200 with results array', async () => {
    readCookbook()
    const { status, json } = await postJson('/rag/search', { query: 'hello', k: 3 })
    expect(status).toBe(200)
    // /rag/search returns a bare top-level JSON array (see
    // `rag_results_to_json` at `crates/ogdb-cli/src/lib.rs:3730`).
    expect(Array.isArray(json), 'rag/search must return a top-level JSON array').toBe(true)
  })

  test('recipe 3: POST /rag/ingest then POST /query reads the ingested doc back', async () => {
    readCookbook()
    const ingest = await postJson('/rag/ingest', {
      title: 'cookbook-recipe-3',
      format: 'PlainText',
      content: 'Alice works with Bob on the OpenGraphDB cookbook.',
    })
    expect(ingest.status).toBe(200)

    const query = await postJson('/query', { query: 'MATCH (n) RETURN count(n) AS c' })
    expect(query.status).toBe(200)
    // /query returns rows in a specific shape; just assert the body decodes
    // and contains a numeric count >= 1 anywhere in the JSON.
    const body = JSON.stringify(query.json)
    expect(body).toMatch(/\b[1-9][0-9]*\b/)
  })

  test('recipe 4: POST /mcp/invoke temporal_diff returns snapshot_a + snapshot_b', async () => {
    readCookbook()
    const now = Math.floor(Date.now() / 1000)
    // Flat tool-call shape (see comment on the browse_schema test above).
    const { status, json } = await postJson('/mcp/invoke', {
      name: 'temporal_diff',
      arguments: { timestamp_a: 0, timestamp_b: now },
    })
    expect(status).toBe(200)
    const stringified = JSON.stringify(json)
    expect(stringified).toContain('snapshot_a')
    expect(stringified).toContain('snapshot_b')
  })

  test('recipe 4: POST /query with AT TIME returns 200', async () => {
    readCookbook()
    const { status } = await postJson('/query', {
      query: 'MATCH (a)-[:KNOWS]->(b) AT TIME 1750000000000 RETURN b',
    })
    expect(status).toBe(200)
  })

  test('recipe 6: migrate-from-Neo4j section names the three differences', () => {
    const body = readCookbook()
    expect(body).toContain('Single-file')
    expect(body).toContain('Apache 2.0')
    expect(body).toContain('AI-native')
  })

  test('recipe 7: CI-regression section references release-tests + skill-regression', () => {
    const body = readCookbook()
    expect(body).toContain('release-tests')
    expect(body).toContain('skill-regression')
  })
})
