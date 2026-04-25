import { expect, test, type Page } from '@playwright/test'

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((activeTheme) => {
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(activeTheme)
  }, theme)
}

test.describe('Playground Page Visual Coverage', () => {
  test('renders split-pane layout with movielens dataset', async ({ page }) => {
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    const sidebar = page.locator('aside').first()
    await expect(page.getByRole('heading', { name: 'Playground' })).toBeVisible()
    await expect(sidebar).toBeVisible()
    await expect(page.locator('canvas')).toBeVisible()
    await expect(page.getByText('Sample Data')).toBeVisible()
    await expect(page.getByTestId('dataset-switcher').first()).toHaveValue('movielens')
    await expect(page.getByTestId('query-card')).toHaveCount(6)

    await page.screenshot({ path: 'e2e/screenshots/playground-movielens-light.png' })
  })

  test('captures airroutes dataset screenshot via URL parameter', async ({ page }) => {
    await page.goto('/playground?dataset=airroutes')
    await page.waitForLoadState('networkidle')

    const sidebar = page.locator('aside').first()
    await expect(page).toHaveURL(/dataset=airroutes/)
    await expect(page.getByTestId('dataset-switcher').first()).toHaveValue('airroutes')
    await expect(sidebar.getByText(/Practical Gremlin Air Routes/i)).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/playground-airroutes-light.png' })
  })

  test('captures got dataset screenshot via URL parameter', async ({ page }) => {
    await page.goto('/playground?dataset=got')
    await page.waitForLoadState('networkidle')

    const sidebar = page.locator('aside').first()
    await expect(page).toHaveURL(/dataset=got/)
    await expect(page.getByTestId('dataset-switcher').first()).toHaveValue('got')
    await expect(sidebar.getByText(/character-interaction subgraph across 8 seasons/i)).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/playground-got-light.png' })
  })

  test('switching dataset updates URL and active dataset details', async ({ page }) => {
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    const sidebar = page.locator('aside').first()
    const switcher = page.getByTestId('dataset-switcher').first()
    await expect(switcher).toHaveValue('movielens')

    await switcher.selectOption('airroutes')
    await expect(page).toHaveURL(/dataset=airroutes/)
    await expect(switcher).toHaveValue('airroutes')
    await expect(sidebar.getByText(/Practical Gremlin Air Routes/i)).toBeVisible()
  })

  test('query cards and stats panel render in sidebar', async ({ page }) => {
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    const sidebar = page.locator('aside').first()
    const cards = page.getByTestId('query-card')
    await expect(cards).toHaveCount(6)

    await cards.nth(1).click()
    await expect(cards.nth(1)).toHaveClass(/border-primary/)
    const statsPanel = sidebar.getByTestId('stats-panel')
    await expect(statsPanel.getByText(/^Nodes$/)).toBeVisible()
    await expect(statsPanel.getByText(/^Edges$/)).toBeVisible()
    await expect(statsPanel.getByText(/^Labels$/)).toBeVisible()
  })

  test('captures dark mode screenshot', async ({ page }) => {
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    await setTheme(page, 'dark')
    await expect(page.locator('aside')).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/playground-movielens-dark.png' })
  })
})
