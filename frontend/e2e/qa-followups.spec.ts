/**
 * qa-followups.spec.ts — regression gates for the QA bugs found in the
 * 2026-04-30 frontend audit (/tmp/wt-frontend-qa/QA-REPORT.md).
 *
 * Bugs covered here:
 *   #2/#3 — `liveError` was not cleared on Power Mode success, so a
 *           previous failed query left a stale red banner over a 200-OK
 *           result table or a 0-row empty state.
 *   #5    — the dev `AppRouter` rendered `<App />` for /app while the
 *           production `AppShellRouter` already redirects /app → /playground.
 *           The dev router must mirror the redirect.
 *
 * Bug #1 (ogdb demo panic) is covered by a Rust unit test in
 * `crates/ogdb-cli/src/lib.rs::http_dispatch_serves_api_without_embedded_spa`.
 * Bug #4 (body.error vs body.message) is covered by
 * `frontend/src/api/client.test.ts`.
 */
import { expect, test } from '@playwright/test'

// -- Bug #5 ---------------------------------------------------------------
// Pre-fix: `npm run dev` served /app via the legacy AppRouter which still
// rendered the heavy `<App />` component (empty editor, NODES/EDGES/LABELS=0).
// The production AppShellRouter already redirects /app → /playground; this
// test pins the dev router to the same behaviour.
test('Bug #5: /app redirects to /playground in the dev router', async ({ page }) => {
  await page.goto('/app')
  // Wait for the navigation to settle — Navigate replace lands almost
  // instantly, but the playground page is React.lazy-loaded so we wait for
  // the canvas mount as the "fully rendered" signal.
  await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 15000 })

  await expect(page).toHaveURL(/\/playground(?:[/?#].*)?$/, { timeout: 5000 })
  // The legacy App page rendered "NODES/EDGES/LABELS = 0" stat tiles. Their
  // absence on /app proves we're on the playground (which uses dataset
  // counts via DatasetHeader), not the legacy shell.
  await expect(page.getByTestId('dataset-header')).toBeVisible()
})

// -- Bugs #2/#3 -----------------------------------------------------------
// Trigger a failed Power Mode query (mock /query → 400) so liveError is
// set, then run a successful query and assert the destructive banner
// reading "Query failed" is gone. Pre-fix: the banner persisted because
// `setLiveError(null)` was missing on the success path of handlePowerQuery.
test('Bug #2/#3: stale liveError clears after a successful Power Mode query', async ({ page }) => {
  let queryCallCount = 0
  await page.route('**/query', async (route) => {
    queryCallCount += 1
    if (queryCallCount === 1) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'query error: semantic analysis error: unbound variable: cnt',
        }),
      })
      return
    }
    // Second call: success with one row.
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        columns: ['n'],
        rows: [{ n: 1 }],
        row_count: 1,
      }),
    })
  })

  await page.goto('/playground')
  await page.locator('canvas').first().waitFor({ state: 'visible' })

  // Flip Power Mode on so the Cypher editor + Run button render.
  // PowerModeToggle is identified by its aria-label, not a testid.
  const powerToggle = page.getByRole('button', { name: 'Power mode' })
  await powerToggle.click()
  const editorPanel = page.getByTestId('power-mode-panel')
  await expect(editorPanel).toBeVisible()

  // Type a query, run it (1st call → 400). The CodeMirror surface inside
  // CypherEditorPanel responds to keyboard.insertText after click-focus.
  const editor = editorPanel.locator('.cm-content').first()
  await editor.click()
  await page.keyboard.insertText('MATCH (n) RETURN n LIMIT 1')

  await editorPanel.getByRole('button', { name: /run/i }).first().click()

  // After failure, QueryResultSummary flips to data-state="error".
  const summary = page.getByTestId('query-result-summary')
  await expect(summary).toHaveAttribute('data-state', 'error', { timeout: 5000 })
  await expect(summary).toContainText(/query error: semantic analysis error/i)

  // Now re-run — same query body, but route.fulfill returns 200 this time.
  await editorPanel.getByRole('button', { name: /run/i }).first().click()

  // The destructive state must clear once the success response lands.
  // Pre-fix: `liveError` survived the success path and the banner stayed
  // visible. Post-fix: data-state flips to "ok".
  await expect(summary).toHaveAttribute('data-state', 'ok', { timeout: 5000 })
})
