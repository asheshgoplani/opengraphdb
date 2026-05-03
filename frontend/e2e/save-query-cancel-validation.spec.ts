// COV-H13 — Saved-queries dialog: Cancel / Esc dismissal + name validation.
//
// COVERAGE-AUDIT.md gap H13 (P42):
//   "Saved-queries dialog: Cancel/Esc dismissal + name validation untested."
//   `save-query-roundtrip.spec.ts` (COV-B4) already pins the happy path —
//   save → reload → reopen. The escape paths and the empty-name guard rail
//   are still uncovered, so a regression that, e.g., wires Cancel through
//   `handleSave()` or removes the `disabled={!name.trim()}` predicate would
//   silently corrupt localStorage.
//
// This spec pins three contracts on `SaveQueryDialog`:
//   1. Save button is disabled while the name input is empty / whitespace.
//   2. Pressing Esc with the dialog open closes it and writes nothing to
//      localStorage `ogdb-query-history`.
//   3. Clicking Cancel with the dialog open closes it and writes nothing.
//
// Selector strategy mirrors save-query-roundtrip.spec.ts: open Power mode,
// click the lazy-mount placeholder, type into the CodeMirror `.cm-content`,
// then drive the dialog through its name input + Cancel/Esc affordances.

import { expect, test, type Page } from '@playwright/test'

const STORAGE_KEY = 'ogdb-query-history'
const QUERY_BODY = 'MATCH (n:Movie) RETURN n LIMIT 5'

interface PersistedQueryHistory {
  state?: {
    savedQueries?: Array<{ id: string; name: string; query: string; savedAt: string }>
  }
}

async function readSavedQueries(page: Page) {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)
  if (!raw) return []
  const parsed = JSON.parse(raw) as PersistedQueryHistory
  return parsed.state?.savedQueries ?? []
}

async function openPowerModeWithQuery(page: Page) {
  await page.goto('/playground')
  await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: /Power mode/i }).click()
  const powerPanel = page.getByTestId('power-mode-panel')
  await expect(powerPanel).toBeVisible()

  // Lazy CodeMirror — click placeholder, then wait for `.cm-content`.
  await page.getByTestId('cypher-editor-placeholder').click()
  const editor = powerPanel.locator('.cm-content').first()
  await editor.waitFor({ state: 'visible' })
  await editor.click()
  await page.keyboard.insertText(QUERY_BODY)

  // The top-level `Save` trigger becomes enabled iff `currentQuery.trim()`
  // is non-empty. Waiting for that predicate is the cleanest signal that
  // CodeMirror's onUpdate has propagated the typed text into the store
  // (otherwise the click race would be flaky on cold worker boots).
  const saveTrigger = page.getByRole('button', { name: /^Save$/ }).first()
  await expect(saveTrigger).toBeEnabled({ timeout: 15_000 })

  return powerPanel
}

async function openSaveDialog(page: Page) {
  // Scope to the first `Save` button — the one OUTSIDE the dialog. The
  // footer's own `Save` button (inside the open dialog) is a sibling match.
  const saveTrigger = page.getByRole('button', { name: /^Save$/ }).first()
  await saveTrigger.click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: /Save Query/i })).toBeVisible()
  return dialog
}

test.describe('COV-H13 — SaveQueryDialog Cancel / Esc / name validation', () => {
  test('empty name keeps the footer Save button disabled', async ({ page }) => {
    await openPowerModeWithQuery(page)
    const dialog = await openSaveDialog(page)

    // The footer Save button (the one INSIDE the dialog) must be disabled
    // until a non-whitespace name is entered. The trigger Save button (the
    // one OUTSIDE the dialog) is also called "Save", so scope explicitly.
    const footerSave = dialog.getByRole('button', { name: /^Save$/ })
    await expect(footerSave, 'footer Save must start disabled (empty name)').toBeDisabled()

    const nameInput = dialog.getByPlaceholder(/All Person nodes/i)
    await nameInput.fill('   ') // whitespace only
    await expect(
      footerSave,
      'footer Save must remain disabled for whitespace-only name',
    ).toBeDisabled()

    await nameInput.fill('Real name')
    await expect(
      footerSave,
      'footer Save must enable once a non-whitespace name is typed',
    ).toBeEnabled()

    // Clear back to empty — disabled again, proving the predicate is live.
    await nameInput.fill('')
    await expect(footerSave).toBeDisabled()

    // No localStorage write should have occurred during validation poking.
    expect(await readSavedQueries(page)).toHaveLength(0)
  })

  test('Esc closes the dialog without writing to localStorage', async ({ page }) => {
    await openPowerModeWithQuery(page)
    const dialog = await openSaveDialog(page)

    // Type a name so we can be sure the dismissal — not an empty-name guard
    // — is what prevents the write.
    await dialog.getByPlaceholder(/All Person nodes/i).fill('Will be discarded')

    await page.keyboard.press('Escape')
    await expect(dialog, 'dialog must close on Esc').toBeHidden()

    expect(
      await readSavedQueries(page),
      'Esc must NOT persist anything to localStorage',
    ).toHaveLength(0)
  })

  test('Cancel button closes the dialog without writing to localStorage', async ({ page }) => {
    await openPowerModeWithQuery(page)
    const dialog = await openSaveDialog(page)

    await dialog.getByPlaceholder(/All Person nodes/i).fill('Also discarded')

    await dialog.getByRole('button', { name: /^Cancel$/ }).click()
    await expect(dialog, 'dialog must close on Cancel').toBeHidden()

    expect(
      await readSavedQueries(page),
      'Cancel must NOT persist anything to localStorage',
    ).toHaveLength(0)
  })
})
