/**
 * cypher-keyboard.spec.ts — Power Mode Cypher editor keyboard contract.
 *
 * Closes BLOCKER B2 from .planning/c17-coverage-audit/COVERAGE-AUDIT.md:
 *   "Cypher editor keyboard contract (Cmd/Ctrl+Enter, ↑/↓ history) is
 *    untested e2e. This is the playground's primary input."
 *
 * Contract under test (from @neo4j-cypher/react-codemirror):
 *   1. Mod-Enter (Ctrl on Linux/Win, Cmd on Mac) fires `onExecute` when the
 *      doc is non-empty. We exercise both `Control+Enter` and `Meta+Enter`
 *      so the spec asserts the same user-visible behaviour on either OS.
 *   2. ArrowUp on an empty editor (cursor at pos 0) loads the most recent
 *      history entry; a second ArrowUp loads the next-older entry.
 *      ArrowDown with cursor at end-of-doc walks forward (back to draft).
 */
import { expect, test } from '@playwright/test'

async function openPowerEditor(page: import('@playwright/test').Page) {
  await page.goto('/playground')
  await page.locator('canvas').first().waitFor({ state: 'visible' })

  await page.getByRole('button', { name: 'Power mode' }).click()
  const editorPanel = page.getByTestId('power-mode-panel')
  await expect(editorPanel).toBeVisible()

  // CypherEditorPanel renders a placeholder <textarea> until first
  // pointerdown/focus, then mounts the lazy CodeMirror surface (`.cm-content`).
  await editorPanel.getByTestId('cypher-editor-placeholder').click()
  const editor = editorPanel.locator('.cm-content').first()
  await editor.waitFor({ state: 'visible', timeout: 30_000 })
  await editor.click()
  return { editorPanel, editor }
}

test('Cmd/Ctrl+Enter from the editor executes the query', async ({ page }) => {
  let queryCallCount = 0
  await page.route('**/query', async (route) => {
    queryCallCount += 1
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

  const { editor } = await openPowerEditor(page)
  await page.keyboard.insertText('MATCH (n) RETURN n LIMIT 1')

  // Issue both shortcuts so the assertion holds on either OS:
  //   Linux/Win runner: Control+Enter triggers the keymap (Mod=Ctrl).
  //   Mac runner:       Meta+Enter triggers the keymap (Mod=Cmd).
  await editor.click()
  await page.keyboard.press('Control+Enter')
  await page.keyboard.press('Meta+Enter')

  await expect
    .poll(() => queryCallCount, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(1)

  // The QueryResultSummary should reflect a successful run, proving the
  // keyboard path reached the same handler the Run button uses.
  await expect(page.getByTestId('query-result-summary')).toHaveAttribute(
    'data-state',
    'ok',
    { timeout: 5_000 }
  )
})

test('ArrowUp/ArrowDown scroll the Cypher query history', async ({ page }) => {
  // Seed the persisted zustand store before the app boots so `history` is
  // non-empty when CypherEditor mounts (the keymap snapshots history at
  // mount time via `replaceHistory`).
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'ogdb-query-history',
      JSON.stringify({
        state: {
          history: [
            'MATCH (a:First) RETURN a LIMIT 1',
            'MATCH (b:Second) RETURN b LIMIT 2',
          ],
          savedQueries: [],
        },
        version: 0,
      })
    )
  })

  const { editor } = await openPowerEditor(page)

  // Empty editor with cursor at position 0 is the precondition for the
  // replMode keymap (requires `empty && head === 0`); openPowerEditor leaves
  // us there because `currentQuery` defaults to ''. CodeMirror renders an
  // aria-placeholder `<span class="cm-placeholder">` inside `.cm-content`
  // when the doc is empty, so we cannot toHaveText('') here — we only
  // assert that ArrowUp replaces whatever is rendered with history[0].

  // ArrowUp #1 → most recent entry (history[0]).
  await page.keyboard.press('ArrowUp')
  await expect(editor).toHaveText('MATCH (a:First) RETURN a LIMIT 1')

  // After BACK, navigateHistory parks the cursor at anchor 0, so a second
  // ArrowUp continues walking older.
  await page.keyboard.press('ArrowUp')
  await expect(editor).toHaveText('MATCH (b:Second) RETURN b LIMIT 2')

  // ArrowDown only walks FORWARDS when the cursor is at end-of-doc; jump
  // there with Ctrl+End and step back toward the draft (empty buffer).
  await page.keyboard.press('Control+End')
  await page.keyboard.press('ArrowDown')
  await expect(editor).toHaveText('MATCH (a:First) RETURN a LIMIT 1')

  await page.keyboard.press('Control+End')
  await page.keyboard.press('ArrowDown')
  // Back at the draft: CodeMirror re-renders the `cm-placeholder` span,
  // which is only present when the doc is empty.
  await expect(editor.locator('.cm-placeholder')).toBeVisible()
})
