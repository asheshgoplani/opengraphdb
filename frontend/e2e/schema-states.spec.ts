/**
 * schema-states.spec.ts — C17 coverage gap H8: BackendSchemaStrip loading
 * skeleton + error UI + Retry recovery.
 *
 * COVERAGE-AUDIT.md (H8, SB11, SB12) flagged that BackendSchemaStrip renders
 * three branches (`loading` / `error` / `ok`), but the suite only proved
 * `ok` (claims/schema-tab-real-backend.spec.ts at line 88+). The loading
 * skeleton has zero coverage. The error branch has a thin assertion (just
 * `data-state="error"` in the existing spec) — the user-visible affordances
 * (the "backend unreachable" copy, the surfaced exception message, and the
 * Retry button click → second request) are all unguarded.
 *
 * Why this matters: the loading copy is the user's first signal that
 * something is happening; the error copy + Retry button are the *only*
 * affordances when /schema is down. A regression that dropped the Retry
 * onClick (`onClick={load}` at BackendSchemaStrip.tsx:67) would leave a
 * dead button on screen and the user would have to refresh the page to
 * recover. That regression must fail CI loudly.
 *
 * What's pinned here:
 *   1. Loading branch  — data-state="loading" + "GET /schema · fetching"
 *      copy is visible while /schema is in flight.
 *   2. Error branch    — data-state="error" + "GET /schema · backend
 *      unreachable" heading + the surfaced exception message + a Retry
 *      button visible to the user.
 *   3. Retry recovery  — clicking Retry fires a second GET /schema and the
 *      strip transitions to data-state="ok" once the second request
 *      succeeds. (Without this assertion, the Retry handler could be wired
 *      to a no-op and we'd never know.)
 */
import { expect, test, type Page } from '@playwright/test'

const SETTINGS_KEY = 'ogdb-settings'

// Seed the persisted settings so BackendSchemaStrip's ApiClient targets
// the Vite proxy `/api`, which we can intercept with page.route.
async function seedApiServerUrl(page: Page): Promise<void> {
  await page.addInitScript((key: string) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        state: { serverUrl: '/api', theme: 'dark', resultLimit: 500 },
        version: 1,
      }),
    )
  }, SETTINGS_KEY)
}

test.describe('H8 · BackendSchemaStrip loading + error + retry', () => {
  test('renders the loading skeleton (data-state="loading") while GET /schema is in flight', async ({
    page,
  }) => {
    // Hold /api/schema open for ~400ms so the loading branch is observable.
    // Without the delay the request resolves before Playwright can hand
    // control back to us and the loading state is invisible to the test.
    await page.route('**/api/schema', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 400))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          labels: ['Person'],
          edge_types: ['KNOWS'],
          property_keys: ['name'],
          relationshipTypes: ['KNOWS'],
        }),
      })
    })

    await seedApiServerUrl(page)
    await page.goto('/playground', { waitUntil: 'commit' })
    await page.getByRole('tab', { name: 'Schema' }).click()

    const strip = page.getByTestId('backend-schema-strip')
    await expect(strip).toBeVisible()
    await expect(
      strip,
      'while /schema is pending, the strip must render data-state="loading" — a regression to "idle" or "ok" would hide the in-flight signal',
    ).toHaveAttribute('data-state', 'loading')

    // The loading copy is what the user reads while waiting; pin it so a
    // refactor to a generic "Loading…" string is caught.
    await expect(strip).toContainText('GET /schema')
    await expect(strip).toContainText('fetching')

    // After the delayed fulfil, the strip must transition out of loading so
    // we know the state machine isn't stuck.
    await expect(strip).toHaveAttribute('data-state', 'ok', { timeout: 5000 })
  })

  test('renders the error UI (data-state="error" + Retry button) when GET /schema fails', async ({
    page,
  }) => {
    await page.route('**/api/schema', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'synthetic backend-down for H8' }),
      }),
    )

    await seedApiServerUrl(page)
    await page.goto('/playground')
    await page.getByRole('tab', { name: 'Schema' }).click()

    const strip = page.getByTestId('backend-schema-strip')
    await expect(strip).toBeVisible()
    await expect(
      strip,
      'when /schema returns 500, the strip must enter data-state="error" — silent fallback would mask backend regressions',
    ).toHaveAttribute('data-state', 'error', { timeout: 5000 })

    // The error copy and the surfaced exception message are the user's only
    // diagnostics. A regression that dropped either one would leave the user
    // staring at a blank red box; pin both.
    await expect(strip).toContainText('GET /schema')
    await expect(strip).toContainText('backend unreachable')
    await expect(
      strip,
      'the exception message ApiClient threw must be surfaced verbatim — "backend-down" is what tells the user WHY it failed, not just THAT it failed',
    ).toContainText('synthetic backend-down for H8')

    // The Retry button is the only affordance to recover without a page reload.
    const retry = strip.getByRole('button', { name: 'Retry' })
    await expect(
      retry,
      'a Retry button must be visible in the error state — without it the user has to F5 the whole page to escape',
    ).toBeVisible()

    // ok-state UI must NOT be present — proves branches are mutually exclusive.
    await expect(page.getByTestId('backend-schema-labels')).toHaveCount(0)
  })

  test('Retry click fires a second GET /schema and recovers to data-state="ok" when the backend comes back', async ({
    page,
  }) => {
    // Track every /api/schema request so we can prove the click *actually*
    // re-fired the request (not just toggled local state).
    const schemaRequests: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/schema')) {
        schemaRequests.push(req.url())
      }
    })

    // The initial mount can fire /schema *twice* under React StrictMode
    // (double-invocation of effects in dev). We need every initial-mount
    // request to fail so the strip lands in `error`; only the Retry click
    // should succeed. Track whether the user has clicked Retry and gate the
    // happy path on that signal — counting requests is fragile because
    // StrictMode could change to one or three invocations across React
    // versions, but a Retry click is what we actually want to assert
    // recovers.
    let retryClicked = false
    await page.route('**/api/schema', async (route) => {
      if (!retryClicked) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'transient: cold start' }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            labels: ['Person'],
            edge_types: ['KNOWS'],
            property_keys: ['name'],
            relationshipTypes: ['KNOWS'],
          }),
        })
      }
    })

    await seedApiServerUrl(page)
    await page.goto('/playground')
    await page.getByRole('tab', { name: 'Schema' }).click()

    const strip = page.getByTestId('backend-schema-strip')
    await expect(strip).toHaveAttribute('data-state', 'error', { timeout: 5000 })
    expect(
      schemaRequests.length,
      'first GET /schema must have fired before the user sees the error',
    ).toBeGreaterThanOrEqual(1)
    const requestsBeforeRetry = schemaRequests.length

    retryClicked = true
    await strip.getByRole('button', { name: 'Retry' }).click()

    await expect(
      strip,
      'after Retry the strip must reach data-state="ok" — proves Retry`s onClick is wired to load() and not a no-op',
    ).toHaveAttribute('data-state', 'ok', { timeout: 5000 })

    expect(
      schemaRequests.length,
      'Retry click must have fired a NEW GET /schema, not just flipped local state',
    ).toBeGreaterThan(requestsBeforeRetry)

    // And the recovered state surfaces the seeded labels — last-mile proof
    // that the strip parsed the second response correctly.
    await expect(page.getByTestId('backend-schema-labels')).toContainText('Person')
  })
})
