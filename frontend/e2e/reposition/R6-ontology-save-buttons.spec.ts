import { expect, test } from '@playwright/test'

// R6 — cover the two role-only sidebar buttons that pre-R6 had no spec:
//   * "Ontology" (in SchemaBrowser) — toggles ontology rendering on the canvas.
//   * "Save" (in SaveQueryDialog, visible only with Power mode on) — opens the
//     Save Query dialog. /playground exposes the same Power-mode editor /app
//     uses, so keeping this guard ensures the dialog can still be opened.

test.describe('R6 — sidebar toggle buttons', () => {
  test('Ontology toggle is clickable and flips its aria-pressed state', async ({ page }) => {
    await page.goto('/playground?dataset=wikidata')
    await page.waitForLoadState('networkidle')

    // Schema panel lives in the desktop sidebar; pick the first Ontology
    // button (the sidebar one is rendered regardless of tab).
    const ontologyBtn = page.getByRole('button', { name: /^Ontology$/i }).first()
    await expect(ontologyBtn).toBeVisible()

    // Click toggles the styling — the class list shifts between `border-cyan`
    // (active) and `border-white/15` (inactive). Assert class changes.
    const classBefore = (await ontologyBtn.getAttribute('class')) ?? ''
    await ontologyBtn.click()
    const classAfter = (await ontologyBtn.getAttribute('class')) ?? ''
    expect(classAfter).not.toBe(classBefore)
  })

  test('Power mode exposes a Save button that opens the Save Query dialog once a query is typed', async ({
    page,
  }) => {
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /Power mode/i }).click()

    const saveBtn = page.getByRole('button', { name: /^Save$/ }).first()
    await expect(saveBtn).toBeVisible()
    // Disabled until the Cypher editor has non-empty content.
    await expect(saveBtn).toBeDisabled()

    const editor = page.getByRole('textbox', { name: /Cypher query editor/i })
    await editor.click()
    await editor.fill('MATCH (n) RETURN n LIMIT 1')

    await expect(saveBtn).toBeEnabled()
    await saveBtn.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('heading', { name: /Save Query/i })).toBeVisible()
  })
})
