// B3 Live-mode failure paths (COVERAGE-AUDIT.md, P32/P33/SB5/SB6/SB7).
//
// Pre-fix: a real backend that returns 4xx/5xx, a backend whose /health is
// offline, or a /schema request that hangs all left the playground without an
// asserted UI guarantee. The overlay rendered via PlaygroundPage's
// `liveError` branch had no testid, so any regression that hid it (e.g. an
// AnimatePresence rewrite, a state-clearing bug, a CSS rule that pushed it
// off-canvas) would slip past the e2e suite.
//
// These tests stub the API tier with `page.route()` so we can exercise each
// failure mode without spinning up `ogdb serve`. The contract pinned here:
//   - POST /query returning 4xx -> live-error-overlay visible, banner copy
//     reads "Live query failed" + the body.error message.
//   - POST /query returning 5xx -> same overlay, propagates upstream message.
//   - GET /health offline (combined with /query failure, since a real offline
//     backend fails both) -> live-error-overlay visible after a query attempt.
//   - GET /schema hanging -> playground still mounts, live query failure path
//     still surfaces the overlay (schema timeout must not freeze the UI).
//
// Why hit `**/query` not `**/api/query`: ApiClient talks directly to
// `serverUrl` (default http://localhost:8080), with no `/api` prefix —
// playground-page.tsx:56 wires `new ApiClient(serverUrl)` and the client
// fetches `${baseUrl}/query`. Faking `/api/query` would mock nothing.

import { expect, test, type Page, type Route } from '@playwright/test'

const QUERY_PATTERN = '**/query'
const HEALTH_PATTERN = '**/health'
const SCHEMA_PATTERN = '**/schema'

async function fulfillJson(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function gotoPlaygroundLive(page: Page) {
  await page.goto('/playground')
  // PlaygroundPage is React.lazy-loaded; wait for the canvas mount so the
  // Suspense fallback is gone and the LiveModeToggle is reachable.
  await page.locator('canvas').first().waitFor({ state: 'visible' })

  // The toggle has two buttons ("Sample" + "Live"); scope the role lookup to
  // the testid wrapper so we don't accidentally match the ConnectionBadge's
  // "Live" label.
  await page
    .getByTestId('live-mode-toggle')
    .getByRole('button', { name: 'Live' })
    .click()
}

async function runFirstLiveQuery(page: Page) {
  // In live mode, visibleQueries is filtered to entries with a liveDescriptor,
  // so the first query-card is guaranteed to trigger POST /query.
  await page.getByTestId('query-card').first().click()
}

test.describe('B3 live-mode failure paths', () => {
  test('POST /query 4xx surfaces live-error-overlay with body.error copy', async ({
    page,
  }) => {
    await page.route(QUERY_PATTERN, (route) =>
      fulfillJson(route, 400, {
        error: 'query error: semantic analysis error: unbound variable: m',
      }),
    )

    await gotoPlaygroundLive(page)
    await runFirstLiveQuery(page)

    const overlay = page.getByTestId('live-error-overlay')
    await expect(overlay).toBeVisible()
    await expect(overlay).toContainText(/live query failed/i)
    await expect(overlay).toContainText(/unbound variable: m/i)
  })

  test('POST /query 5xx surfaces live-error-overlay with body.error copy', async ({
    page,
  }) => {
    await page.route(QUERY_PATTERN, (route) =>
      fulfillJson(route, 500, { error: 'internal server error: storage panic' }),
    )

    await gotoPlaygroundLive(page)
    await runFirstLiveQuery(page)

    const overlay = page.getByTestId('live-error-overlay')
    await expect(overlay).toBeVisible()
    await expect(overlay).toContainText(/live query failed/i)
    await expect(overlay).toContainText(/storage panic/i)
  })

  test('GET /health offline + /query failure surfaces live-error-overlay', async ({
    page,
  }) => {
    // Simulate a backend that is fully unreachable: /health 503 (so the
    // app considers itself offline), /query also 503 with an offline-ish
    // body. Either failure alone would not exercise the live-error path —
    // it is the combination that mirrors a real offline backend.
    await page.route(HEALTH_PATTERN, (route) =>
      fulfillJson(route, 503, { status: 'unavailable' }),
    )
    await page.route(QUERY_PATTERN, (route) =>
      fulfillJson(route, 503, { error: 'service unavailable' }),
    )

    await gotoPlaygroundLive(page)
    await runFirstLiveQuery(page)

    const overlay = page.getByTestId('live-error-overlay')
    await expect(overlay).toBeVisible()
    await expect(overlay).toContainText(/live query failed/i)
    await expect(overlay).toContainText(/service unavailable/i)
  })

  test('GET /schema timeout does not block live-error-overlay rendering', async ({
    page,
  }) => {
    // Hang the schema request indefinitely. Pre-fix, a hung /schema could
    // mask other failure paths if React Suspense / blocking effects were
    // introduced upstream. Pin the contract: the playground still mounts
    // and a subsequent live query failure still raises the overlay.
    await page.route(SCHEMA_PATTERN, async () => {
      await new Promise<void>(() => {
        /* never resolve — Playwright aborts on context teardown */
      })
    })
    await page.route(QUERY_PATTERN, (route) =>
      fulfillJson(route, 500, { error: 'upstream schema timeout' }),
    )

    await gotoPlaygroundLive(page)
    await runFirstLiveQuery(page)

    const overlay = page.getByTestId('live-error-overlay')
    await expect(overlay).toBeVisible()
    await expect(overlay).toContainText(/live query failed/i)
    await expect(overlay).toContainText(/upstream schema timeout/i)
  })
})
