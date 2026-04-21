import { expect, test } from '@playwright/test'
import { spawn, spawnSync, execFile } from 'child_process'
import type { ChildProcessWithoutNullStreams } from 'child_process'
import { mkdtempSync, rmSync, existsSync, statSync, chmodSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'

const execFileP = promisify(execFile)

// Unique URI namespace per test run so repeated imports against the shared DB
// still produce fresh nodes/edges (the beforeAll backend is shared across tests).
function sampleTtl(tag: string): string {
  return `@prefix ex: <http://example.org/${tag}/> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .

ex:alice a foaf:Person ; foaf:name "Alice" ; foaf:knows ex:bob .
ex:bob   a foaf:Person ; foaf:name "Bob"   ; foaf:knows ex:alice .
ex:carol a foaf:Person ; foaf:name "Carol" ; foaf:knows ex:alice .
`
}

// Playwright's cwd during the run is the `frontend/` directory (playwright.config.ts lives there).
// The repo root sits one directory above.
const REPO_ROOT = join(process.cwd(), '..')
const OGDB_BIN = join(REPO_ROOT, 'target', 'release', 'ogdb')
const SERVE_PORT = 8080
const HEALTH_URL = `http://127.0.0.1:${SERVE_PORT}/health`

let serveProc: ChildProcessWithoutNullStreams | null = null
let serveDir: string | null = null
let serveDbPath: string | null = null

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

test.describe('fix/rdf-import-fake — dropzone must actually persist', () => {
  test.beforeAll(async () => {
    ensureReleaseBinary()

    serveDir = mkdtempSync(join(tmpdir(), 'rdf-e2e-'))
    serveDbPath = join(serveDir, 'live.ogdb')

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

  test('drop triggers POST /api/rdf/import with the file bytes', async ({ page }) => {
    const ttl = sampleTtl('t1')
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    const importRequests: { url: string; method: string; bodyLen: number }[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/rdf/import')) {
        importRequests.push({
          url: req.url(),
          method: req.method(),
          bodyLen: (req.postData() ?? '').length,
        })
      }
    })

    await page.evaluate(async (ttl: string) => {
      const file = new File([ttl], 'sample.ttl', { type: 'text/turtle' })
      const dt = new DataTransfer()
      dt.items.add(file)
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      })
      document.body.dispatchEvent(dropEvent)
    }, ttl)

    const commit = page.getByTestId('rdf-import-commit')
    await expect(commit).toBeVisible({ timeout: 5000 })

    const importResp = page.waitForResponse((r) => r.url().includes('/api/rdf/import'), {
      timeout: 15_000,
    })
    await commit.click()
    await importResp

    expect(importRequests, 'dropzone must POST the file to /api/rdf/import').toHaveLength(1)
    const req = importRequests[0]
    expect(req.method).toBe('POST')
    expect(req.bodyLen).toBeGreaterThan(0)
  })

  test('imported .ttl is persisted to the server-open .ogdb and readable via ogdb info', async ({
    page,
  }) => {
    if (!serveDbPath) throw new Error('beforeAll did not set serveDbPath')
    const dbPath = serveDbPath
    const ttl = sampleTtl('t2')

    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    await page.evaluate(async (ttl: string) => {
      const file = new File([ttl], 'sample.ttl', { type: 'text/turtle' })
      const dt = new DataTransfer()
      dt.items.add(file)
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      })
      document.body.dispatchEvent(dropEvent)
    }, ttl)

    const commit = page.getByTestId('rdf-import-commit')
    await expect(commit).toBeVisible({ timeout: 5000 })

    const importResp = page.waitForResponse((r) => r.url().includes('/api/rdf/import'), {
      timeout: 15_000,
    })
    await commit.click()
    const resp = await importResp
    expect(resp.status(), 'server should accept the POST (not 404)').toBe(200)

    const body = await resp.json()
    expect(body.ok).toBe(true)
    expect(body.db_path).toMatch(/\.ogdb$/)
    expect(body.imported_nodes).toBeGreaterThan(0)
    expect(body.imported_edges).toBeGreaterThan(0)

    await expect(page.getByTestId('rdf-import-persisted')).toBeVisible({ timeout: 5000 })
    const dbPathText = await page.getByTestId('rdf-import-db-path').innerText()
    expect(dbPathText).toContain(dbPath)

    expect(existsSync(dbPath), `expected ${dbPath} to exist after import`).toBe(true)
    expect(statSync(dbPath).size).toBeGreaterThan(0)

    const { stdout } = await execFileP(
      OGDB_BIN,
      ['info', dbPath],
      { cwd: REPO_ROOT, maxBuffer: 8 * 1024 * 1024 },
    )
    expect(stdout).toMatch(/total_nodes\s*=\s*[1-9]/)
    expect(stdout).toMatch(/total_edges\s*=\s*[1-9]/)
  })
})
