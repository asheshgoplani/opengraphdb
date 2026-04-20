import { expect, test } from '@playwright/test'

// RED test for PLAN slice S6: Vector + full-text search with hybrid toggle.
// Expected to FAIL today — no Semantic tab or SemanticSearchPanel exists.
// Goes GREEN when slice 6 lands (SemanticSearchPanel + hybrid mode).

test.describe('Playground premium — S6 semantic search', () => {
  test('Semantic tab surfaces vector / full-text / hybrid modes', async ({ page }) => {
    await page.goto('/playground?dataset=movielens')
    await page.waitForLoadState('networkidle')

    const semanticTab = page.getByRole('tab', { name: /Semantic/i })
    await expect(semanticTab).toBeVisible()
    await semanticTab.click()

    const modeGroup = page.getByRole('radiogroup', { name: /search mode/i })
    await expect(modeGroup).toBeVisible()
    await expect(modeGroup.getByRole('radio', { name: /Vector/i })).toBeVisible()
    await expect(modeGroup.getByRole('radio', { name: /Full-text/i })).toBeVisible()
    await expect(modeGroup.getByRole('radio', { name: /Hybrid/i })).toBeVisible()
  })

  test('Hybrid search returns ranked results with score badges', async ({ page }) => {
    await page.goto('/playground?dataset=movielens')
    await page.waitForLoadState('networkidle')

    await page.getByRole('tab', { name: /Semantic/i }).click()
    await page.getByRole('radio', { name: /Hybrid/i }).click()

    await page.getByRole('searchbox', { name: /semantic/i }).fill('space opera')
    await page.getByRole('button', { name: /^Search$/ }).click()

    const rows = page.getByTestId('search-result-row')
    await expect(rows.first()).toBeVisible({ timeout: 5_000 })
    await expect(rows).toHaveCount(5)

    // Each row must show a score badge
    for (let i = 0; i < 5; i += 1) {
      await expect(rows.nth(i).getByTestId('score-badge')).toBeVisible()
    }
  })
})
