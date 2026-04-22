import { expect, test } from '@playwright/test'
import { samplePeopleTurtle, useOgdbServeFixture } from '../_helpers/serve-fixture'

// F5 (slice R3) — Power tab claim:
//   "Type Cypher. Execute. Real rows come back from the Rust engine."
//
// Arrange: spawn a real `ogdb serve --http` against a tempdir DB, then seed it
// with 3 Person nodes + 3 knows edges via /rdf/import. Override the frontend's
// configured serverUrl to "/api" so the browser talks to the backend through
// the Vite dev proxy (bypassing CORS on the raw localhost:8080 origin).
//
// Act:   flip Power mode on, type `MATCH (n) RETURN n LIMIT 10`, click Run.
// Assert:
//   1. The frontend POSTed JSON to /api/query with the expected body.
//   2. The backend returned 200 with row_count >= 3 (since we seeded 3 nodes).
//   3. The on-page QueryResultTable renders at least 3 rows (real data, not a stub).
//
// Backend lifecycle (beforeAll/afterAll) is owned by the serve fixture so this
// spec never races another spec's server: Playwright workers=1 in this repo.

// Claim specs share port 8080 because Vite's dev proxy (vite.config.ts) is
// hard-coded to forward /api/* → http://localhost:8080. Since Playwright runs
// with workers=1, the rdf-import-real fixture has already torn down by the
// time this file's beforeAll fires.
const PORT = 8080

// The ogdb-settings zustand persist key written to localStorage. Keep in sync
// with `name: 'ogdb-settings'` in src/stores/settings.ts.
const SETTINGS_KEY = 'ogdb-settings'

test.describe('F5 · power tab executes real Cypher against ogdb serve', () => {
  const serve = useOgdbServeFixture({ port: PORT })

  test.beforeEach(async ({ page, context }) => {
    // Point the frontend at the same-origin /api proxy so it goes through Vite
    // (which proxies /api → http://localhost:8080). Without this, ApiClient
    // hits localhost:8080 directly and the browser blocks it on CORS.
    await context.addInitScript((key: string) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          state: {
            serverUrl: '/api',
            theme: 'dark',
            resultLimit: 500,
            aiProvider: 'webllm',
            aiApiKey: '',
            aiModel: '',
            aiBaseUrl: '',
          },
          version: 0,
        }),
      )
    }, SETTINGS_KEY)
    // Silence analytic noise, load the page cold.
    void page
  })

  test('seeded graph → MATCH (n) RETURN n LIMIT 10 → ≥3 rows rendered from real backend', async ({
    page,
  }) => {
    // Arrange — seed exactly 3 Person nodes via /rdf/import on the real server.
    const seed = await serve.seedTurtle(samplePeopleTurtle('f5'))
    expect(
      seed.imported_nodes,
      'fixture.seedTurtle should have imported exactly 3 nodes from the sample TTL',
    ).toBe(3)
    expect(
      seed.imported_edges,
      'fixture.seedTurtle should have imported exactly 3 knows edges from the sample TTL',
    ).toBe(3)

    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    // Capture the outbound POST /query so we can assert exact URL + body later.
    const queryRequests: Array<{ url: string; method: string; body: string }> = []
    page.on('request', (req) => {
      if (req.url().includes('/api/query') && !req.url().includes('/trace')) {
        queryRequests.push({
          url: req.url(),
          method: req.method(),
          body: req.postData() ?? '',
        })
      }
    })

    // Act — flip Power mode on; type the query; click Run.
    const powerToggle = page.getByRole('button', { name: /Power mode/i })
    await expect(powerToggle, 'the Power mode toggle must exist on the header').toBeVisible()
    await powerToggle.click()
    await expect(
      page.getByTestId('power-mode-panel'),
      'clicking Power mode must reveal the Cypher editor panel',
    ).toBeVisible()

    // The @neo4j-cypher/react-codemirror editor renders a contenteditable;
    // focus it and type. We use keyboard typing (not evaluate) so that the
    // CodeMirror state machine runs just like a real developer typed it.
    const editor = page.getByRole('textbox', { name: /Cypher query editor/i })
    await editor.click()
    await page.keyboard.type('MATCH (n) RETURN n LIMIT 10')

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/query') && !r.url().includes('/trace'),
      { timeout: 15_000 },
    )
    await page.getByRole('button', { name: /^Run$/ }).click()
    const resp = await responsePromise

    // Assert — backend returned real rows.
    expect(resp.status(), 'POST /query against real backend must return 200').toBe(200)
    const body = (await resp.json()) as { columns: string[]; rows: unknown[]; row_count: number }
    expect(
      body.row_count,
      `backend must return >= 3 rows (we seeded 3 Person nodes). got columns=${JSON.stringify(
        body.columns,
      )}, row_count=${body.row_count}`,
    ).toBeGreaterThanOrEqual(3)

    expect(
      queryRequests.length,
      'exactly one POST /api/query should have fired from Power mode run',
    ).toBe(1)
    const outbound = queryRequests[0]
    expect(outbound.method, 'Power mode must use POST for /api/query').toBe('POST')
    expect(
      outbound.body,
      'outbound body must include the query the user typed, ending with LIMIT 10',
    ).toContain('MATCH (n) RETURN n LIMIT 10')

    // Assert — UI rendered the real rows (not a stub / not empty).
    const resultSection = page.getByTestId('power-query-result')
    await expect(
      resultSection,
      'QueryResultTable must render after a successful power-mode query',
    ).toBeVisible()

    const rowCountLabel = page.getByTestId('power-query-result-row-count')
    await expect(
      rowCountLabel,
      'the result header must show the row_count returned by the backend',
    ).toHaveText(String(body.row_count))

    const renderedRows = page.getByTestId('power-query-result-row')
    await expect(
      renderedRows,
      'at least 3 rows must be rendered in the table (min of seeded + returned)',
    ).toHaveCount(Math.min(body.row_count, 50))
    expect(
      await renderedRows.count(),
      'the rendered row count must be > 0 — empty tables would mean the UI did not wire the response',
    ).toBeGreaterThanOrEqual(3)
  })

  test('power-mode error state renders when the query is malformed against real backend', async ({
    page,
  }) => {
    // Arrange — no seeding needed; an invalid Cypher will 500/400 from the engine.
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    // Act — Power mode on; type deliberately bad Cypher; Run.
    await page.getByRole('button', { name: /Power mode/i }).click()
    await expect(page.getByTestId('power-mode-panel')).toBeVisible()

    const editor = page.getByRole('textbox', { name: /Cypher query editor/i })
    await editor.click()
    await page.keyboard.type('THIS_IS_NOT_CYPHER_AT_ALL 123 $$$')

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/query') && !r.url().includes('/trace'),
      { timeout: 15_000 },
    )
    await page.getByRole('button', { name: /^Run$/ }).click()
    const resp = await responsePromise

    // Assert — backend rejected the query, UI showed the real error from the server.
    expect(
      resp.status(),
      'malformed Cypher should return a non-200 status from the real engine',
    ).not.toBe(200)

    await expect(
      page.getByTestId('power-query-result-error'),
      'the UI must surface a visible error when the backend rejects the query — silent failure is a regression',
    ).toBeVisible({ timeout: 5000 })
  })
})
