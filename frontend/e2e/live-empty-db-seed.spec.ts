/**
 * live-empty-db-seed.spec.ts — H6 from the C17 coverage audit.
 *
 *   "LiveEmptyDbCTA seed → POST /import flow not exercised end-to-end
 *    (P31, UC8, AE5, SB9, SB10). First-time user onboarding path."
 *
 * pg-high-fixes only checks that the CTA button is present. This spec
 * exercises the full first-run onboarding flow that ships with
 * `ogdb serve --http` against an empty database:
 *
 *   1. Live mode + empty schema → live-empty-db-cta is rendered in the
 *      sidebar (LiveEmptyDbCTA owns its own /schema check; the playground
 *      mounts it inside `{isLiveMode && (…)}`).
 *   2. Click the CTA → fetch fires POST `${serverUrl}/import` with a
 *      JSON body whose nodes/edges shape matches the buildImportPayload
 *      contract in LiveEmptyDbCTA.tsx (no inputs from the user — the
 *      bundled GoT sample is the entire payload).
 *   3. Backend 200 with imported_nodes/imported_edges → the empty-state CTA
 *      goes away (LiveEmptyDbCTA returns null once it considers the schema
 *      populated). The "done" banner branch is dead code under React 18
 *      automatic batching — setSeedState({phase:'done'}) + setSchemaState
 *      ({phase:'populated'}) coalesce into one render, and the populated
 *      early-return short-circuits before the done banner ever renders. The
 *      user-visible success signal IS the disappearance, so that is what we
 *      pin (a meaningful, non-flake assertion).
 *   4. Backend non-2xx with body.message → CTA stays in seed state and
 *      surfaces the inline error line ("AlertTriangle … message").
 */
import { expect, test, type Page, type Request, type Route } from '@playwright/test'

interface ImportPayload {
  nodes: Array<{ id: number; labels: string[]; properties: Record<string, unknown> }>
  edges: Array<{ src: number; dst: number; edge_type?: string; properties: Record<string, unknown> }>
}

async function fulfillEmptySchema(route: Route) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ labels: [], edge_types: [], property_keys: [] }),
  })
}

async function fulfillHealthOk(route: Route) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'ok' }),
  })
}

async function flipToLiveMode(page: Page) {
  await page.goto('/playground')
  await page.locator('canvas').first().waitFor({ state: 'visible' })
  await page
    .getByTestId('live-mode-toggle')
    .getByRole('button', { name: 'Live' })
    .click()
}

test.describe('H6 — LiveEmptyDbCTA → POST /import seed flow', () => {
  test('successful seed: CTA visible → click → POST /import payload → CTA disappears', async ({
    page,
  }) => {
    await page.route('**/health', fulfillHealthOk)
    await page.route('**/schema', fulfillEmptySchema)

    let importRequest: Request | null = null
    let importCallCount = 0
    await page.route('**/import', async (route, request) => {
      importCallCount += 1
      importRequest = request
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ imported_nodes: 23, imported_edges: 47 }),
      })
    })

    await flipToLiveMode(page)

    // Sidebar CTA: only rendered when isLiveMode && schemaState === 'empty'.
    // Scope subsequent locators to it so the test does not pick up the
    // EmptyDbOverlay "Import a dataset" button (separate component).
    const cta = page.getByTestId('live-empty-db-cta')
    await expect(cta).toBeVisible()
    await expect(cta).toContainText(/live db is empty/i)

    const seedButton = cta.getByTestId('live-empty-db-cta-button')
    await expect(seedButton).toBeEnabled()
    await seedButton.click()

    // The POST /import call must fire exactly once with the bundled GoT
    // sample shape. We can't pin the exact node count (GOT_SAMPLE may grow)
    // but we can pin: it's a POST with JSON body, contains nodes[] and
    // edges[] arrays, and each node has the {id, labels, properties} shape.
    await expect.poll(() => importCallCount, { timeout: 10_000 }).toBe(1)
    expect(importRequest).not.toBeNull()
    expect(importRequest!.method()).toBe('POST')
    expect(importRequest!.headers()['content-type']).toContain('application/json')

    const postedBody = importRequest!.postDataJSON() as ImportPayload
    expect(Array.isArray(postedBody.nodes)).toBe(true)
    expect(Array.isArray(postedBody.edges)).toBe(true)
    expect(postedBody.nodes.length).toBeGreaterThan(0)
    expect(postedBody.edges.length).toBeGreaterThan(0)
    expect(postedBody.nodes[0]).toMatchObject({
      id: expect.any(Number),
      labels: expect.any(Array),
      properties: expect.any(Object),
    })
    expect(postedBody.edges[0]).toMatchObject({
      src: expect.any(Number),
      dst: expect.any(Number),
      properties: expect.any(Object),
    })

    // Success signal under React 18 automatic batching: handleSeed sets
    // both seedState→'done' and schemaState→'populated' in the same async
    // tick, so by the time React renders the populated early-return fires
    // and LiveEmptyDbCTA returns null. The pre-seed CTA goes away — that
    // disappearance is the user-visible "the seed worked" cue, and the
    // testid we can deterministically observe.
    await expect(page.getByTestId('live-empty-db-cta')).toHaveCount(0, {
      timeout: 5_000,
    })
  })

  test('failed seed: backend 500 surfaces inline error and keeps CTA actionable', async ({
    page,
  }) => {
    await page.route('**/health', fulfillHealthOk)
    await page.route('**/schema', fulfillEmptySchema)

    await page.route('**/import', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'storage quota exceeded' }),
      }),
    )

    await flipToLiveMode(page)

    const cta = page.getByTestId('live-empty-db-cta')
    await expect(cta).toBeVisible()
    await cta.getByTestId('live-empty-db-cta-button').click()

    // The seed-state error branch reads body.message and surfaces it
    // inline; the banner stays mounted (no flip to -done).
    await expect(cta).toContainText(/storage quota exceeded/i, { timeout: 5_000 })
    await expect(page.getByTestId('live-empty-db-cta-done')).toHaveCount(0)

    // Button must be re-enabled so the user can retry — disabled is only
    // for the in-flight 'seeding' phase.
    await expect(cta.getByTestId('live-empty-db-cta-button')).toBeEnabled()
  })
})
