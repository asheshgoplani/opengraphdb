import { expect, test } from '@playwright/test'

// RED test for PLAN slice S9: Cross-surface polish pass.
// Expected to FAIL today — no Power-mode toggle exists on /playground,
// QueryCard/StatsPanel/ConnectionBadge lack the hover-lift transition class,
// and /app lacks the shared footer status bar.
// Goes GREEN when slice 9 lands.

test.describe('Playground premium — S9 polish + cohesion', () => {
  test('Power-mode toggle reveals the Cypher editor on /playground', async ({ page }) => {
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    const toggle = page.getByRole('button', { name: /Power mode/i })
    await expect(toggle).toBeVisible()

    // Editor must not be present in the DOM before the toggle is clicked.
    const editor = page.getByRole('textbox', { name: /Cypher query editor/i })
    await expect(editor).toHaveCount(0)

    await toggle.click()
    await expect(editor).toBeVisible()
  })

  test('Sidebar cards have the shared hover-lift transition', async ({ page }) => {
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    const card = page.getByTestId('query-card').first()
    await expect(card).toBeVisible()

    const transitionProperty = await card.evaluate((el) => getComputedStyle(el).transitionProperty)
    // The landing FeaturesSection uses transition-all; accept either 'all' or a
    // compound including transform+box-shadow.
    expect(transitionProperty).toMatch(/all|transform/)
  })

  test('/app shares the footer status bar with /playground', async ({ page }) => {
    await page.goto('/app')
    await page.waitForLoadState('networkidle')

    const statusBar = page.getByTestId('status-bar')
    await expect(statusBar).toBeVisible()
    await expect(statusBar).toContainText(/nodes/)
    await expect(statusBar).toContainText(/edges/)
  })
})
