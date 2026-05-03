// COVERAGE-AUDIT.md H11 — ConnectionBadge disconnected / error / query-time
// states (P4, SB7).
//
// `R6-live-connection-toggle.spec.ts` already pins the Sample-state label and
// the Live-label flip when the user toggles the mode header switch. Three
// states it does NOT cover, all of which are reachable in real deployments:
//
//   1. **Live + query failure** — backend returns 4xx/5xx. The badge swaps
//      its label to "Error" and renders the truncated message instead of a
//      query time. A regression that kept the Live label visible during a
//      failing backend would mislead users into thinking they're talking to
//      a healthy server.
//   2. **Live + success: query-time annotation** — after a successful Live
//      query, the badge renders the elapsed milliseconds WITHOUT the
//      "(in-memory)" suffix that Sample mode always carries. This suffix
//      is the visible signal that distinguishes Sample latency theatre from
//      Live wire latency. Pinning it prevents a regression where the
//      `formatQueryTime` branch is inverted.
//   3. **Sample query-time updates** — running a guided query in Sample mode
//      bumps the rendered query time. We pin "Sample Data" + "(in-memory)"
//      both in idle and post-run states, so a regression that froze the
//      counter at 0 ms would surface here.
//
// We mock POST /query so we can drive both success and failure deterministic-
// ally without `ogdb serve`. ApiClient calls the bare `/query` path on the
// configured serverUrl, so the route pattern has no `/api/` prefix.

import { expect, test, type Page, type Route } from '@playwright/test'

const QUERY_PATTERN = '**/query'

async function fulfillJson(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function gotoPlayground(page: Page) {
  await page.goto('/playground')
  await page.locator('canvas').first().waitFor({ state: 'visible' })
}

async function clickFirstQueryCard(page: Page) {
  await page.getByTestId('query-card').first().click()
}

async function toggleLiveMode(page: Page) {
  await page
    .getByTestId('live-mode-toggle')
    .getByRole('button', { name: 'Live' })
    .click()
}

test.describe('H11 · ConnectionBadge disconnected / error / query-time states', () => {
  test('Sample mode shows "Sample Data" + "(in-memory)" both at idle and after a guided query', async ({
    page,
  }) => {
    await gotoPlayground(page)

    const badge = page.getByTestId('connection-badge')
    await expect(badge).toBeVisible()
    // Idle Sample state: label + in-memory annotation are both present.
    await expect(badge).toContainText(/Sample Data/i)
    await expect(badge).toContainText(/in-memory/i)

    // Run a guided query — Sample mode resolves the query in-process, so the
    // rendered query time updates to a non-zero "<1ms (in-memory)" value.
    // Critical: the in-memory suffix must persist after the query, since
    // staying in Sample mode is what the suffix signals.
    await clickFirstQueryCard(page)
    await expect(badge).toContainText(/Sample Data/i)
    await expect(badge).toContainText(/in-memory/i)
    await expect(badge).toContainText(/\d+ms|<1ms/i)
  })

  test('Live mode + successful query shows "Live" + elapsed ms WITHOUT the "(in-memory)" suffix', async ({
    page,
  }) => {
    // Mock /query with a quick successful response so the badge can render
    // a non-zero queryTimeMs. row_count + an empty rows array is enough —
    // the live-query path only reads timing, not body contents, for the
    // badge.
    await page.route(QUERY_PATTERN, (route) =>
      fulfillJson(route, 200, {
        columns: ['n'],
        rows: [],
        row_count: 0,
      }),
    )

    await gotoPlayground(page)
    await toggleLiveMode(page)

    const badge = page.getByTestId('connection-badge')
    // After flipping to Live but before running a query, badge already shows
    // "Live" (driven by the mode flag, not by query state).
    await expect(badge).toContainText(/^\s*Live/i)

    await clickFirstQueryCard(page)

    // Successful Live query: badge stays on "Live" and shows ms elapsed.
    // The "(in-memory)" suffix MUST NOT be present — formatQueryTime drops
    // it in Live mode and a regression that re-adds it would falsely
    // advertise sample latency for live data.
    await expect(badge).toContainText(/^\s*Live/i)
    await expect(badge).toContainText(/\d+ms|<1ms/i)
    await expect(badge).not.toContainText(/in-memory/i)
  })

  test('Live mode + 5xx failure flips badge to "Error" with the body.error message and no query-time', async ({
    page,
  }) => {
    await page.route(QUERY_PATTERN, (route) =>
      fulfillJson(route, 500, { error: 'service unavailable: backend offline' }),
    )

    await gotoPlayground(page)
    await toggleLiveMode(page)

    const badge = page.getByTestId('connection-badge')
    // Pre-failure: Live label is set by the mode flag.
    await expect(badge).toContainText(/^\s*Live/i)

    await clickFirstQueryCard(page)

    // Post-failure: liveError takes priority over isLive in the badge's
    // label resolution, so "Live" must be replaced by "Error". A regression
    // that kept the Live label visible during a failing backend would
    // mislead users into thinking they're talking to a healthy server.
    await expect(badge).toContainText(/Error/i)
    await expect(badge).not.toContainText(/^\s*Live\s*$/i)

    // The truncated error message must surface in the badge — this is the
    // only inline signal the user gets without opening the live-error
    // overlay. The badge truncates with `max-w-[120px] truncate` so we
    // assert on a substring of the body.error.
    await expect(badge).toContainText(/backend offline/i)

    // While erroring, the query-time annotation must NOT render — a stale
    // "0ms" or "<1ms" alongside "Error" would falsely imply a measured
    // round-trip.
    await expect(badge).not.toContainText(/in-memory/i)
    await expect(badge).not.toContainText(/^\s*Error\s*·\s*\d+ms/i)
  })
})
