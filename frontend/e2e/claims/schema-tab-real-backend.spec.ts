import { expect, test } from '@playwright/test'
import { samplePeopleTurtle, useOgdbServeFixture } from '../_helpers/serve-fixture'

// F6 (slice R3) — Schema tab claim:
//   "The Schema tab is populated from the live backend: GET /schema returns
//    labels, edge types, and property keys from the real ogdb storage."
//
// Arrange: spawn a real ogdb serve, seed 3 Person nodes + 3 knows edges. Point
// the frontend at /api so BackendSchemaStrip's fetch goes through the Vite
// proxy to the real server.
//
// Act:   navigate to /playground, switch to the Schema tab.
// Assert:
//   1. BackendSchemaStrip fires GET /api/schema on mount.
//   2. The strip renders state=ok with labels=['Person'], edges=['knows'], and
//      property_keys containing '_uri' and 'name'.
//   3. Counts exposed via data-count attributes match the response, so a
//      future reader can wire trend assertions without parsing innerText.

// Shared port with the rest of the claim suite — Vite's /api proxy hard-codes
// localhost:8080 and workers=1 guarantees serial spec execution.
const PORT = 8080
const SETTINGS_KEY = 'ogdb-settings'

test.describe('F6 · schema tab renders GET /schema from real ogdb serve', () => {
  const serve = useOgdbServeFixture({ port: PORT })

  test.beforeEach(async ({ context }) => {
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
  })

  test('seeded graph → Schema tab → BackendSchemaStrip shows real labels + edges from /schema', async ({
    page,
  }) => {
    // Arrange — seed the backend with a known shape.
    const seed = await serve.seedTurtle(samplePeopleTurtle('f6'))
    expect(seed.imported_nodes, 'seedTurtle should persist 3 Person nodes').toBe(3)

    // Belt-and-suspenders: hit the backend directly from Node first. If the
    // engine regressed upstream, the UI assertions below would be misleading —
    // better to fail here with a clear message.
    const schemaResp = await fetch(`${serve.apiBase}/schema`)
    expect(schemaResp.status, 'backend /schema must return 200 on a live server').toBe(200)
    const schema = (await schemaResp.json()) as {
      labels: string[]
      edge_types: string[]
      property_keys: string[]
    }
    expect(schema.labels, 'real backend must surface "Person" label after TTL seed').toContain(
      'Person',
    )
    expect(schema.edge_types, 'real backend must surface "KNOWS" edge type after TTL seed').toContain(
      'KNOWS',
    )

    // Capture outbound GET /api/schema so we can assert the UI really fetched it.
    const schemaRequests: Array<{ url: string; method: string }> = []
    page.on('request', (req) => {
      if (req.url().includes('/api/schema')) {
        schemaRequests.push({ url: req.url(), method: req.method() })
      }
    })

    // Act — go to playground, switch to Schema tab.
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    const schemaTab = page.getByRole('tab', { name: 'Schema' })
    await expect(schemaTab, 'Schema tab pill must be visible on /playground').toBeVisible()
    await schemaTab.click()

    // Assert — strip becomes state=ok with real counts from backend.
    const strip = page.getByTestId('backend-schema-strip')
    await expect(
      strip,
      'BackendSchemaStrip must render inside the Schema tab panel',
    ).toBeVisible()
    await expect(
      strip,
      'the strip must reach state=ok after a successful GET /schema',
    ).toHaveAttribute('data-state', 'ok', { timeout: 5000 })

    expect(
      schemaRequests.length,
      'the UI must have fired at least one real GET /api/schema — stubs are forbidden in claim specs',
    ).toBeGreaterThanOrEqual(1)
    const firstRequest = schemaRequests[0]
    expect(firstRequest.method).toBe('GET')

    const labelsStat = page.getByTestId('backend-schema-labels')
    const edgesStat = page.getByTestId('backend-schema-edges')
    const propsStat = page.getByTestId('backend-schema-properties')

    await expect(
      labelsStat,
      'labels stat must expose the count the backend returned via data-count',
    ).toHaveAttribute('data-count', String(schema.labels.length))
    await expect(
      edgesStat,
      'edge_types stat must expose the count the backend returned via data-count',
    ).toHaveAttribute('data-count', String(schema.edge_types.length))
    await expect(
      propsStat,
      'property_keys stat must expose the count the backend returned via data-count',
    ).toHaveAttribute('data-count', String(schema.property_keys.length))

    await expect(
      labelsStat,
      'human-readable label list must include "Person" as sampled from the real backend',
    ).toContainText('Person')
    await expect(
      edgesStat,
      'human-readable edge list must include "KNOWS" as sampled from the real backend',
    ).toContainText('KNOWS')
    await expect(
      propsStat,
      'property_keys sample must include "name" (TTL seed wrote foaf:name)',
    ).toContainText('name')
  })

  test('Schema tab surfaces an error state when backend is unreachable', async ({ page }) => {
    // Arrange — stub /api/schema to fail so the error path exercises for real.
    // NOTE: page.route is intentional here. The purpose of this test is to prove
    // the UI renders a user-visible error (not a silent fallback) when the real
    // HTTP roundtrip fails. The happy path is covered by the test above.
    await page.route('**/api/schema', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'synthetic backend-down' }),
      }),
    )

    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    await page.getByRole('tab', { name: 'Schema' }).click()

    const strip = page.getByTestId('backend-schema-strip')
    await expect(strip).toBeVisible()
    await expect(
      strip,
      'when /schema returns 500, the strip must enter state=error — silent fallback would mask backend regressions',
    ).toHaveAttribute('data-state', 'error', { timeout: 5000 })
  })
})
