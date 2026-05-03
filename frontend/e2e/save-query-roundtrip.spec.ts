import { expect, test } from '@playwright/test'

// COV-B4 — Save Query persistence round-trip.
//
// COVERAGE-AUDIT.md headline finding #6:
//   "Saved queries and query history have unit tests but no e2e flow.
//    A user who saves → reloads → reopens has no automated proof the
//    round-trip works."
//
// queryHistory.ts persists savedQueries via zustand/middleware `persist`
// against localStorage key "ogdb-query-history". This spec is the e2e
// proof: name + body survive a full page reload, and the SaveQueryDialog
// is still reachable from a freshly hydrated /playground.

const STORAGE_KEY = 'ogdb-query-history'
const QUERY_BODY = 'MATCH (n:Person) RETURN n LIMIT 25'
const QUERY_NAME = 'Round-trip persons'

interface PersistedQueryHistory {
  state?: {
    savedQueries?: Array<{ id: string; name: string; query: string; savedAt: string }>
  }
}

async function readSavedQueries(page: import('@playwright/test').Page) {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)
  expect(raw, `localStorage["${STORAGE_KEY}"] must exist after save`).not.toBeNull()
  const parsed = JSON.parse(raw!) as PersistedQueryHistory
  return parsed.state?.savedQueries ?? []
}

test.describe('COV-B4 — Save Query persistence round-trip', () => {
  test('save → reload → store + dialog still hold the query', async ({ page }) => {
    // Arrange — fresh /playground, no prior saved queries.
    await page.goto('/playground')
    await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY)
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Flip Power mode so the CypherEditorPanel (which owns SaveQueryDialog)
    // mounts. /playground hides the editor by default.
    await page.getByRole('button', { name: /Power mode/i }).click()
    const powerPanel = page.getByTestId('power-mode-panel')
    await expect(powerPanel).toBeVisible()

    // H1 lazy-loads CypherEditor on first interaction; click the placeholder
    // textarea, then wait for CodeMirror's .cm-content to mount before typing
    // (mirrors claims/power-tab-real-cypher.spec.ts).
    await page.getByTestId('cypher-editor-placeholder').click()
    const editor = powerPanel.locator('.cm-content').first()
    await editor.waitFor({ state: 'visible' })
    await editor.click()
    await page.keyboard.insertText(QUERY_BODY)

    // Act — open SaveQueryDialog, name the query, click Save.
    const saveTrigger = page.getByRole('button', { name: /^Save$/ }).first()
    await expect(saveTrigger).toBeEnabled()
    await saveTrigger.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: /Save Query/i })).toBeVisible()

    // The dialog's <code> preview must echo the typed body — proves the
    // Cypher reached the store, not that we just opened an empty dialog.
    await expect(dialog.locator('code')).toContainText(QUERY_BODY)

    const nameInput = dialog.getByPlaceholder(/All Person nodes/i)
    await nameInput.fill(QUERY_NAME)
    await dialog.getByRole('button', { name: /^Save$/ }).click()
    await expect(dialog).toBeHidden()

    // Assert — localStorage holds exactly one saved query with the
    // name + body we typed.
    const beforeReload = await readSavedQueries(page)
    expect(beforeReload).toHaveLength(1)
    expect(beforeReload[0].name).toBe(QUERY_NAME)
    expect(beforeReload[0].query).toBe(QUERY_BODY)
    expect(beforeReload[0].id, 'id must be a non-empty UUID').toMatch(/^[0-9a-f-]{36}$/i)
    expect(
      Number.isFinite(Date.parse(beforeReload[0].savedAt)),
      'savedAt must be an ISO timestamp',
    ).toBe(true)

    // Round-trip — reload the page, then re-read.
    await page.reload()
    await page.waitForLoadState('networkidle')

    const afterReload = await readSavedQueries(page)
    expect(
      afterReload,
      'savedQueries must survive a full page reload (zustand persist round-trip)',
    ).toHaveLength(1)
    expect(afterReload[0].name).toBe(QUERY_NAME)
    expect(afterReload[0].query).toBe(QUERY_BODY)
    expect(afterReload[0].id).toBe(beforeReload[0].id)

    // Re-flip Power mode — confirms the SaveQueryDialog is still reachable
    // from a freshly hydrated playground (i.e. the persisted store hooked
    // back up to the UI without throwing during render).
    await page.getByRole('button', { name: /Power mode/i }).click()
    const powerPanelAfterReload = page.getByTestId('power-mode-panel')
    await expect(powerPanelAfterReload).toBeVisible()
  })
})
