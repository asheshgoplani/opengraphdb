import { expect, test } from '@playwright/test'

// C17 coverage gap B5 — `/claims` page loading + error UI.
//
// COVERAGE-AUDIT.md (B5, V34/V35) flagged that ClaimsPage renders three
// branches — loading, error, ready — but only the ready branch had any e2e
// proof. Both other branches are reachable in real deployments:
//   * loading: the user lands on /claims while /claims-status.json is in
//     flight (always, on every cold load — but normally too fast to see).
//   * error:   the user lands on /claims when /claims-status.json is missing
//     (404) or the server is down (5xx). This is the state CI must not ship
//     silently.
//
// We mock the network here instead of relying on dev-server behaviour because
// (a) the dev server actually serves /claims-status.json from disk and we
// can't easily make it fail, and (b) we want the loading branch to stay on
// screen long enough to assert against — a real disk read is sub-millisecond.
//
// Both tests guard against regressions where someone accidentally inverts a
// state branch (e.g. renders ready while loading) or removes the
// remediation copy from the error UI.

test.describe('B5 · /claims loading + error UI', () => {
  test('renders the loading skeleton (data-testid="claims-page-loading") while /claims-status.json is in flight', async ({
    page,
    context,
  }) => {
    // Hold the response open for ~200ms so the loading branch is observable.
    // Without the delay the route resolves before Playwright can hand control
    // back to us and we'd race past the loading state.
    await context.route('**/claims-status.json', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 200))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sha: 'pending',
          date: '2026-04-22T12:00:00Z',
          entries: [
            {
              id: 'stub-loading',
              claim: 'stub claim while loading state was visible',
              status: 'green',
              last_run: '2026-04-22T12:00:00Z',
              evidence: 'e2e/stub.spec.ts',
            },
          ],
        }),
      })
    })

    // Don't wait for networkidle here — we want to catch the page mid-load.
    await page.goto('/claims', { waitUntil: 'commit' })

    const loading = page.getByTestId('claims-page-loading')
    await expect(
      loading,
      'claims-page-loading must render while /claims-status.json is still pending',
    ).toBeVisible()

    // The skeleton sets aria-busy="true" and role="status" for screen readers;
    // a regression that drops those would break announcement of the loading
    // state to assistive tech, so guard them here too.
    await expect(loading).toHaveAttribute('aria-busy', 'true')
    await expect(loading).toHaveAttribute('role', 'status')

    // After the delayed fulfil, the page must transition out of loading so we
    // know the state machine isn't stuck.
    await expect(loading).toBeHidden({ timeout: 5000 })
    await expect(page.getByTestId('claims-table')).toBeVisible()
  })

  test('renders the error UI (data-testid="claims-page-error") with the verify-claims.sh remediation hint when /claims-status.json returns 500', async ({
    page,
    context,
  }) => {
    await context.route('**/claims-status.json', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'text/plain',
        body: 'internal server error',
      }),
    )

    await page.goto('/claims')

    const errorBox = page.getByTestId('claims-page-error')
    await expect(
      errorBox,
      'claims-page-error must render when /claims-status.json fails — silent failure would let prod ship a blank page',
    ).toBeVisible()

    // role="alert" is what surfaces the error to screen readers; a regression
    // that demotes it to a plain <div> would silently break a11y.
    await expect(errorBox).toHaveAttribute('role', 'alert')

    // The error copy must mention what failed and how to recover. The HTTP
    // status string comes from `new Error(\`HTTP \${res.status}\`)` in
    // ClaimsPage.tsx; the remediation hint points the operator at the script
    // that regenerates /claims-status.json.
    await expect(errorBox).toContainText('/claims-status.json')
    await expect(errorBox).toContainText('HTTP 500')
    await expect(errorBox).toContainText('scripts/verify-claims.sh')

    // The ready-state UI must NOT be present — proves the branches are
    // mutually exclusive, not just that error rendered alongside ready.
    await expect(page.getByTestId('claims-table')).toHaveCount(0)
    await expect(page.getByTestId('claims-page-loading')).toHaveCount(0)
  })
})
