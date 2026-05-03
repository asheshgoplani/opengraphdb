// COVERAGE-AUDIT.md B6 — DocPage 404 path.
//
// `/docs/<slug>` (rendered by `frontend/src/pages/DocPage.tsx`) renders a
// non-trivial fallback view when the slug is not in `DOC_REGISTRY`. The
// fallback is conversion-relevant: a misclick from the AI integration cards
// or a stale external link must not deadend the user. Without a guard, the
// fallback is one rename away from rendering blank, and a future regression
// could also start firing backend `/api/*` requests from a marketing surface
// that is supposed to be statically self-contained.
//
// This spec pins:
//   1. The 404 copy renders ("Documentation page not found.")
//   2. A link back to the landing page (`/`) is present and clickable.
//   3. No `/api/*` requests fire while the fallback view is mounted —
//      the marketing surface for an unknown slug must stay backend-silent.

import { expect, test } from '@playwright/test'

test.describe('DocPage 404 fallback (/docs/:slug)', () => {
  test('unknown slug renders fallback with home link and no /api calls', async ({ page }) => {
    // Only count XHR/fetch (real network calls) — Vite's dev server serves
    // TS source modules under `/src/api/*.ts` as `script` loads, which are
    // not backend traffic and must not trip this assertion.
    const apiRequests: string[] = []
    page.on('request', (req) => {
      const type = req.resourceType()
      if (type !== 'xhr' && type !== 'fetch') return
      const url = req.url()
      if (
        url.includes('/api/') ||
        /\/(schema|query|health)(\?|$)/.test(new URL(url).pathname)
      ) {
        apiRequests.push(url)
      }
    })

    await page.goto('/docs/nonexistent-slug')
    await page.waitForLoadState('networkidle')

    // 404 marker + the human-readable fallback heading.
    await expect(page.getByText('404', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: /Documentation page not found/i, level: 1 }),
    ).toBeVisible()

    // Link back to landing — pinned by `to="/"`. Must navigate to `/`.
    const backHomeLink = page.getByRole('link', { name: /Back to home/i })
    await expect(backHomeLink).toBeVisible()
    await expect(backHomeLink).toHaveAttribute('href', '/')

    await backHomeLink.click()
    await expect(page).toHaveURL(/\/$/)

    // Fallback view must not have triggered any backend `/api/*` calls. The
    // DocPage 404 branch is purely client-side: a regression that introduces
    // accidental fetches (telemetry, prefetch, etc.) on a 404 path would be
    // caught here.
    expect(
      apiRequests,
      `unexpected /api requests during 404 render: ${apiRequests.join(', ')}`,
    ).toHaveLength(0)
  })
})
