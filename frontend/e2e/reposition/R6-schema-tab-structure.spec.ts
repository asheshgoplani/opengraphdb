import { expect, test } from '@playwright/test'

// R6 — cover `schema-main-panel` + `schema-browser-header` testids. The Schema
// tab ships as one of the dev-first claims (PLAN §C.1 "Schema introspection —
// labels, edges, property keys"); pre-R6 the outer chrome testids were
// orphaned (the tab label was covered by role but the panels themselves had
// no direct assertion).

test.describe('R6 — schema tab structure', () => {
  test('switching to Schema tab reveals the schema main panel + header', async ({ page }) => {
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    await page.getByRole('tab', { name: 'Schema' }).click()

    const mainPanel = page.getByTestId('schema-main-panel')
    await expect(mainPanel).toBeVisible()
    await expect(mainPanel).toHaveAttribute('data-schema-mode', 'active')

    const header = page.getByTestId('schema-browser-header')
    await expect(header).toBeVisible()
    await expect(header).toContainText(/schema browser/i)
    await expect(header).toContainText(/labels/i)
    await expect(header).toContainText(/property keys/i)
  })

  test('Graph tab does NOT render the schema main panel', async ({ page }) => {
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    // Default tab is Graph; schema-main-panel must be absent.
    await expect(page.getByTestId('schema-main-panel')).toHaveCount(0)
  })
})
