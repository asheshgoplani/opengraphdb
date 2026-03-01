import { expect, test, type Page } from '@playwright/test'

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((activeTheme) => {
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(activeTheme)
  }, theme)
}

test.describe('Playground Page Visual Coverage', () => {
  test('renders split-pane layout with movies dataset', async ({ page }) => {
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    const sidebar = page.locator('aside').first()
    await expect(page.getByRole('heading', { name: 'Playground' })).toBeVisible()
    await expect(sidebar).toBeVisible()
    await expect(page.locator('canvas')).toBeVisible()
    await expect(page.getByText('Sample Data')).toBeVisible()
    await expect(page.getByTestId('dataset-switcher').first()).toHaveValue('movies')
    await expect(page.getByTestId('query-card')).toHaveCount(5)

    await page.screenshot({ path: 'e2e/screenshots/playground-movies-light.png' })
  })

  test('captures social dataset screenshot via URL parameter', async ({ page }) => {
    await page.goto('/playground?dataset=social')
    await page.waitForLoadState('networkidle')

    const sidebar = page.locator('aside').first()
    await expect(page).toHaveURL(/dataset=social/)
    await expect(page.getByTestId('dataset-switcher').first()).toHaveValue('social')
    await expect(sidebar.getByText('Community graph of users, posts, and groups')).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/playground-social-light.png' })
  })

  test('captures fraud dataset screenshot via URL parameter', async ({ page }) => {
    await page.goto('/playground?dataset=fraud')
    await page.waitForLoadState('networkidle')

    const sidebar = page.locator('aside').first()
    await expect(page).toHaveURL(/dataset=fraud/)
    await expect(page.getByTestId('dataset-switcher').first()).toHaveValue('fraud')
    await expect(sidebar.getByText('Financial graph linking accounts, transactions, devices, and IPs')).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/playground-fraud-light.png' })
  })

  test('switching dataset updates URL and active dataset details', async ({ page }) => {
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    const sidebar = page.locator('aside').first()
    const switcher = page.getByTestId('dataset-switcher').first()
    await expect(switcher).toHaveValue('movies')

    await switcher.selectOption('social')
    await expect(page).toHaveURL(/dataset=social/)
    await expect(switcher).toHaveValue('social')
    await expect(sidebar.getByText('Community graph of users, posts, and groups')).toBeVisible()
  })

  test('query cards and stats panel render in sidebar', async ({ page }) => {
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    const sidebar = page.locator('aside').first()
    const cards = page.getByTestId('query-card')
    await expect(cards).toHaveCount(5)

    await cards.nth(1).click()
    await expect(cards.nth(1)).toHaveClass(/border-primary/)
    await expect(sidebar.getByText(/^Nodes$/)).toBeVisible()
    await expect(sidebar.getByText(/^Edges$/)).toBeVisible()
    await expect(sidebar.getByText(/^Labels$/)).toBeVisible()
  })

  test('captures dark mode screenshot', async ({ page }) => {
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    await setTheme(page, 'dark')
    await expect(page.locator('aside')).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/playground-movies-dark.png' })
  })
})
