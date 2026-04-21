import { expect, test } from '@playwright/test'
import { spawn, execFile } from 'child_process'
import type { ChildProcessWithoutNullStreams } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync, existsSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'

// RED test for fix/rdf-import-fake (phase 2 of 8-phase TDD).
// These tests are EXPECTED TO FAIL on main today because:
//  (a) RDFDropzone parses the .ttl client-side only — no network request is ever made.
//  (b) `opengraphdb serve --http` has no POST /rdf/import route.
// They flip GREEN when the plan at .planning/fix-rdf-import-fake/PLAN.md is implemented.

const execFileP = promisify(execFile)

const SAMPLE_TTL = `@prefix ex: <http://example.org/> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .

ex:alice a foaf:Person ; foaf:name "Alice" ; foaf:knows ex:bob .
ex:bob   a foaf:Person ; foaf:name "Bob"   ; foaf:knows ex:alice .
ex:carol a foaf:Person ; foaf:name "Carol" ; foaf:knows ex:alice .
`

// Playwright's cwd during the run is the `frontend/` directory (playwright.config.ts lives there).
// The repo root sits one directory above.
const REPO_ROOT = join(process.cwd(), '..')

test.describe('fix/rdf-import-fake — dropzone must actually persist', () => {
  test('RED: drop triggers POST /api/rdf/import with the file bytes (no network call today)', async ({ page }) => {
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

    // Build a File in-page and dispatch it through the dropzone's handleCommit path.
    // The dropzone listens on document.body for drop events.
    await page.evaluate(async (ttl: string) => {
      const file = new File([ttl], 'red-sample.ttl', { type: 'text/turtle' })
      const dt = new DataTransfer()
      dt.items.add(file)
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      })
      document.body.dispatchEvent(dropEvent)
    }, SAMPLE_TTL)

    const commit = page.getByTestId('rdf-import-commit')
    await expect(commit).toBeVisible({ timeout: 5000 })
    await commit.click()

    // Give the network a beat to settle; this assertion fails on main today.
    await page.waitForTimeout(1500)

    expect(importRequests, 'dropzone must POST the file to /api/rdf/import — today it does not').toHaveLength(1)
    const req = importRequests[0]
    expect(req.method).toBe('POST')
    expect(req.bodyLen).toBeGreaterThan(0)
  })

  test('RED: imported .ttl is persisted to the server-open .ogdb and readable via ogdb info', async ({ page }) => {
    const hasCargo = await new Promise<boolean>((resolve) => {
      execFile('cargo', ['--version'], (err) => resolve(!err))
    })
    test.skip(!hasCargo, 'cargo not on PATH — cannot spawn ogdb serve --http; run plan impl phase instead')

    const workDir = mkdtempSync(join(tmpdir(), 'rdf-red-'))
    const dbPath = join(workDir, 'live.ogdb')
    const ttlPath = join(workDir, 'sample.ttl')
    writeFileSync(ttlPath, SAMPLE_TTL, 'utf-8')

    let serve: ChildProcessWithoutNullStreams | null = null

    try {
      // Per-crate cargo. Debug build. Port 8080 to match the vite proxy target.
      serve = spawn(
        'cargo',
        ['run', '-q', '-p', 'ogdb-cli', '--', 'serve', '--http', '--port', '8080', dbPath],
        { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
      )

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('ogdb serve --http did not come up in 120s')), 120_000)
        serve!.stderr.on('data', (chunk) => {
          if (chunk.toString().includes('listening on http')) {
            clearTimeout(timeout)
            resolve()
          }
        })
        serve!.once('exit', (code) => {
          clearTimeout(timeout)
          reject(new Error(`ogdb serve --http exited early with code ${code}`))
        })
      })

      await page.goto('/playground')
      await page.waitForLoadState('networkidle')

      await page.evaluate(async (ttl: string) => {
        const file = new File([ttl], 'red-sample.ttl', { type: 'text/turtle' })
        const dt = new DataTransfer()
        dt.items.add(file)
        const dropEvent = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        })
        document.body.dispatchEvent(dropEvent)
      }, SAMPLE_TTL)

      const commit = page.getByTestId('rdf-import-commit')
      await expect(commit).toBeVisible({ timeout: 5000 })

      const importResp = page.waitForResponse((r) => r.url().includes('/api/rdf/import'), { timeout: 15000 })
      await commit.click()
      const resp = await importResp
      expect(resp.status(), 'server should accept the POST (not 404)').toBe(200)

      const body = await resp.json()
      expect(body.ok).toBe(true)
      expect(body.db_path).toMatch(/\.ogdb$/)
      expect(body.imported_nodes).toBeGreaterThan(0)
      expect(body.imported_edges).toBeGreaterThan(0)

      // UI should surface the LIVE db path, not a Math.random() fake.
      await expect(page.getByTestId('rdf-import-persisted')).toBeVisible({ timeout: 5000 })
      const dbPathText = await page.getByTestId('rdf-import-db-path').innerText()
      expect(dbPathText).toContain(dbPath)

      // The real file must exist and be non-empty.
      expect(existsSync(dbPath), `expected ${dbPath} to exist after import`).toBe(true)
      expect(statSync(dbPath).size).toBeGreaterThan(0)

      const { stdout } = await execFileP(
        'cargo',
        ['run', '-q', '-p', 'ogdb-cli', '--', 'info', dbPath],
        { cwd: REPO_ROOT, maxBuffer: 8 * 1024 * 1024 },
      )
      expect(stdout).toMatch(/total_nodes\s*=\s*[1-9]/)
      expect(stdout).toMatch(/total_edges\s*=\s*[1-9]/)
    } finally {
      if (serve && !serve.killed) {
        serve.kill('SIGTERM')
        await new Promise((r) => setTimeout(r, 500))
        if (!serve.killed) serve.kill('SIGKILL')
      }
      try { rmSync(workDir, { recursive: true, force: true }) } catch { /* best effort */ }
    }
  })
})
