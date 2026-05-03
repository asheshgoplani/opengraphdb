/**
 * result-table-states.spec.ts — H5 from the C17 coverage audit.
 *
 *   "Result table error / loading testid states untested (P44, P45, SB15,
 *    SB16). Error UX ships untested."
 *
 * QueryResultTable (frontend/src/components/query/QueryResultTable.tsx) has
 * three early returns that no e2e currently exercises:
 *
 *   - isLoading=true → renders a `power-query-result-loading` strip
 *     ("executing against real backend…")
 *   - error≠null    → renders a `power-query-result-error` strip with the
 *     destructive banner ("power mode error · {message}")
 *   - response.row_count === 0 → renders a `power-query-result-empty` line
 *
 * pg-result-table-light-dark.spec.ts only covers contrast on the success
 * path. This spec pins the error + loading branches by intercepting POST
 * /query (ApiClient.query → POST `${baseUrl}/query`, no /api prefix) and
 * forcing each terminal state.
 */
import { expect, test, type Page } from '@playwright/test'

async function openPowerEditor(page: Page) {
  await page.goto('/playground')
  await page.locator('canvas').first().waitFor({ state: 'visible' })

  await page.getByRole('button', { name: 'Power mode' }).click()
  const panel = page.getByTestId('power-mode-panel')
  await expect(panel).toBeVisible()

  await panel.getByTestId('cypher-editor-placeholder').click()
  const editor = panel.locator('.cm-content').first()
  await editor.waitFor({ state: 'visible', timeout: 30_000 })
  await editor.click()
  return { panel, editor }
}

test.describe('H5 — Power-mode QueryResultTable error/loading states', () => {
  test('POST /query 500 surfaces power-query-result-error with backend message', async ({
    page,
  }) => {
    // ApiClient surfaces body.error via extractErrorMessage; PlaygroundPage
    // pipes the caught Error.message into setPowerError, which becomes the
    // `error` prop on QueryResultTable. Pin the chain end-to-end.
    await page.route('**/query', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'storage error: cypher engine panicked at evaluator.rs:421',
        }),
      }),
    )

    await openPowerEditor(page)
    await page.keyboard.insertText('MATCH (n) RETURN n LIMIT 1')
    await page.keyboard.press('Control+Enter')

    const errorStrip = page.getByTestId('power-query-result-error')
    await expect(errorStrip).toBeVisible()
    await expect(errorStrip).toContainText(/power mode error/i)
    await expect(errorStrip).toContainText(/cypher engine panicked/i)

    // The success-path testid must NOT also be in the DOM — the early return
    // in QueryResultTable means error and table are mutually exclusive.
    await expect(page.getByTestId('power-query-result')).toHaveCount(0)
    await expect(page.getByTestId('power-query-result-loading')).toHaveCount(0)
  })

  test('POST /query 4xx surfaces power-query-result-error', async ({ page }) => {
    // 4xx with body.error — same UX, different status. Locks in that
    // ApiError(extractErrorMessage(...)) does not regress the message.
    await page.route('**/query', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'cypher syntax: unexpected token RETURNS at line 1, col 14',
        }),
      }),
    )

    await openPowerEditor(page)
    await page.keyboard.insertText('MATCH (n) RETURNS n')
    await page.keyboard.press('Control+Enter')

    const errorStrip = page.getByTestId('power-query-result-error')
    await expect(errorStrip).toBeVisible()
    await expect(errorStrip).toContainText(/cypher syntax/i)
  })

  test('slow POST /query renders power-query-result-loading during the wait', async ({
    page,
  }) => {
    // Block /query for ~1.5s, then resolve. The loading strip is rendered
    // when `isLiveLoading && !powerResponse` — the wait window is exactly
    // when we should see it.
    let releaseQuery: (() => void) | null = null
    await page.route('**/query', async (route) => {
      await new Promise<void>((resolve) => {
        releaseQuery = resolve
      })
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

    await openPowerEditor(page)
    await page.keyboard.insertText('MATCH (n) RETURN n LIMIT 1')
    await page.keyboard.press('Control+Enter')

    // The loading strip must show while the request is in flight.
    const loadingStrip = page.getByTestId('power-query-result-loading')
    await expect(loadingStrip).toBeVisible({ timeout: 5_000 })
    await expect(loadingStrip).toContainText(/executing against real backend/i)

    // Concurrent error strip must NOT also be visible during the wait.
    await expect(page.getByTestId('power-query-result-error')).toHaveCount(0)

    // Release the request and assert the loading strip clears in favour of
    // the populated result table — proves the loading branch does not stick.
    expect(releaseQuery, 'route handler must have parked the request').not.toBeNull()
    releaseQuery!()

    await expect(page.getByTestId('power-query-result-loading')).toHaveCount(0, {
      timeout: 5_000,
    })
    await expect(page.getByTestId('power-query-result')).toBeVisible({
      timeout: 5_000,
    })
    await expect(page.getByTestId('power-query-result-row-count')).toHaveText('1')
  })
})
