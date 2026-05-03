/**
 * query-history-persistence.spec.ts — H4 from the C17 coverage audit.
 *
 *   "Query history replay (↑/↓) and history persistence round-trip — unit
 *    only (UC16, P39). LocalStorage interaction not asserted in browser."
 *
 * cypher-keyboard.spec.ts (B2) already covers ArrowUp/ArrowDown navigation
 * with a *seeded* `ogdb-query-history` blob in localStorage. That proves the
 * read path. This spec proves the WRITE path that the unit tests cannot:
 *
 *   1. Running a query through the real Power-mode UI flushes through
 *      `useQueryHistoryStore.addToHistory` and lands in
 *      `localStorage["ogdb-query-history"]` with the trimmed query as
 *      `history[0]` (most-recent-first contract enforced by
 *      `buildHistoryWithQuery`).
 *   2. The persisted blob survives a full page reload (zustand persist
 *      middleware round-trip — not just a commit-time snapshot).
 *   3. After reload, ArrowUp on a fresh editor replays the most recent
 *      persisted query — i.e. the read side picks up the just-written value
 *      with no re-seeding required.
 *   4. Distinct subsequent queries are pushed to the front in run order, and
 *      a re-run dedupes (does not double up) — same FIFO semantics enforced
 *      in `buildHistoryWithQuery`.
 */
import { expect, test, type Page, type Route } from '@playwright/test'

const STORAGE_KEY = 'ogdb-query-history'
const FIRST_QUERY = 'MATCH (a:Alpha) RETURN a LIMIT 1'
const SECOND_QUERY = 'MATCH (b:Bravo) RETURN b LIMIT 2'

interface PersistedHistoryBlob {
  state?: {
    history?: string[]
    savedQueries?: unknown[]
  }
}

async function fulfillQueryOk(route: Route) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      columns: ['n'],
      rows: [{ n: 1 }],
      row_count: 1,
    }),
  })
}

async function readPersistedHistory(page: Page): Promise<string[]> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)
  expect(raw, `localStorage["${STORAGE_KEY}"] must be written after a Power-mode run`).not.toBeNull()
  const parsed = JSON.parse(raw!) as PersistedHistoryBlob
  return parsed.state?.history ?? []
}

async function openPowerEditor(page: Page) {
  await page.goto('/playground')
  await page.locator('canvas').first().waitFor({ state: 'visible' })

  await page.getByRole('button', { name: 'Power mode' }).click()
  const panel = page.getByTestId('power-mode-panel')
  await expect(panel).toBeVisible()

  // Lazy CodeMirror only mounts on first pointerdown/focus; the textarea
  // placeholder is the focus surrogate (CypherEditorPanel.tsx:122).
  await panel.getByTestId('cypher-editor-placeholder').click()
  const editor = panel.locator('.cm-content').first()
  await editor.waitFor({ state: 'visible', timeout: 30_000 })
  await editor.click()
  return { panel, editor }
}

test.describe('H4 — query history persistence round-trip', () => {
  test('Power-mode run writes to localStorage, survives reload, and replays via ArrowUp', async ({
    page,
  }) => {
    // /query is what ApiClient hits (ApiClient.query → POST `${baseUrl}/query`).
    // Mocking it lets the test pass against any local dev backend state.
    await page.route('**/query', fulfillQueryOk)

    // Arrange — clear any leftover persisted history from a previous run so
    // the assertion below pins newly-written entries, not stale ones.
    await page.goto('/playground')
    await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY)
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Act — type + run the first query through the real keyboard path.
    let { editor } = await openPowerEditor(page)
    await page.keyboard.insertText(FIRST_QUERY)
    await page.keyboard.press('Control+Enter')

    // Wait for the result-summary to flip to ok so we know the run completed
    // and addToHistory has been invoked synchronously inside handleExecute.
    await expect(page.getByTestId('query-result-summary')).toHaveAttribute(
      'data-state',
      'ok',
      { timeout: 5_000 },
    )

    // Assert (1): localStorage now holds the trimmed query as history[0].
    const afterFirstRun = await readPersistedHistory(page)
    expect(afterFirstRun[0]).toBe(FIRST_QUERY)
    expect(afterFirstRun).toHaveLength(1)

    // Act — run a second distinct query; FIFO should push it to the front.
    await editor.click()
    await page.keyboard.press('Control+End')
    // CypherEditor 2.x has no select-all keymap that matches Mod-A reliably
    // across OSes here; clear by selecting from start to end with shift.
    await page.keyboard.press('Control+Home')
    await page.keyboard.press('Control+Shift+End')
    await page.keyboard.press('Delete')
    await page.keyboard.insertText(SECOND_QUERY)
    await page.keyboard.press('Control+Enter')

    await expect(page.getByTestId('query-result-summary')).toHaveAttribute(
      'data-state',
      'ok',
      { timeout: 5_000 },
    )
    await expect
      .poll(() => readPersistedHistory(page).then((h) => h[0]), { timeout: 5_000 })
      .toBe(SECOND_QUERY)
    const afterSecondRun = await readPersistedHistory(page)
    expect(afterSecondRun).toEqual([SECOND_QUERY, FIRST_QUERY])

    // Re-run the first query — addToHistory must dedupe, not double-add.
    await editor.click()
    await page.keyboard.press('Control+Home')
    await page.keyboard.press('Control+Shift+End')
    await page.keyboard.press('Delete')
    await page.keyboard.insertText(FIRST_QUERY)
    await page.keyboard.press('Control+Enter')

    await expect
      .poll(() => readPersistedHistory(page).then((h) => h[0]), { timeout: 5_000 })
      .toBe(FIRST_QUERY)
    const afterDedupe = await readPersistedHistory(page)
    expect(
      afterDedupe,
      'addToHistory should dedupe — re-running an existing query just moves it to the front',
    ).toEqual([FIRST_QUERY, SECOND_QUERY])

    // Round-trip — full page reload, persisted blob must still hold both.
    await page.reload()
    await page.waitForLoadState('networkidle')

    const afterReload = await readPersistedHistory(page)
    expect(afterReload).toEqual([FIRST_QUERY, SECOND_QUERY])

    // Assert (2): the read side picks up the persisted history without any
    // re-seeding — a fresh editor + ArrowUp loads history[0] (FIRST_QUERY).
    ;({ editor } = await openPowerEditor(page))
    await page.keyboard.press('ArrowUp')
    await expect(editor).toHaveText(FIRST_QUERY)
    await page.keyboard.press('ArrowUp')
    await expect(editor).toHaveText(SECOND_QUERY)
  })
})
