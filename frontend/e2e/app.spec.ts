import { expect, test, type Page } from '@playwright/test'

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((activeTheme) => {
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(activeTheme)
  }, theme)
}

test.describe('App Page Visual Coverage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('link', { name: 'OpenGraphDB' })).toBeVisible()
  })

  test('renders empty state and captures light screenshot', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'OpenGraphDB' })).toBeVisible()
    // Either the connected empty-state copy or the disconnected-state copy is acceptable —
    // CI runners typically have no backend, but a developer running these locally may.
    await expect(
      page.getByText(/run a query to see results|no server reachable yet/i).first(),
    ).toBeVisible()
    await expect(page.locator('.cm-editor')).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/app-empty-light.png' })
  })

  test('shows connection status text in header', async ({ page }) => {
    // Header now has multiple font-medium spans (brand link + status pill).
    // Match the status text directly so we are not coupled to header span order.
    await expect(
      page.locator('header').getByText(/^(Connected|Disconnected|Connecting\.\.\.)$/),
    ).toBeVisible()
  })

  test('captures dark mode empty-state screenshot', async ({ page }) => {
    await setTheme(page, 'dark')
    await expect(
      page.getByText(/run a query to see results|no server reachable yet/i).first(),
    ).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/app-empty-dark.png' })
  })

  test('opens settings dialog and captures screenshot', async ({ page }) => {
    await page.locator('button[title="Settings"]').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/app-settings-light.png' })
  })

  test('captures post-query screenshot when backend is available', async ({ page }) => {
    const statusLocator = page
      .locator('header')
      .getByText(/^(Connected|Disconnected|Connecting\.\.\.)$/)
    await expect(statusLocator).toBeVisible()
    await expect(statusLocator).toHaveText(/Connected|Disconnected/)

    const statusText = (await statusLocator.textContent())?.trim()
    test.skip(statusText !== 'Connected', 'Backend is not connected; skipping post-query screenshot.')

    const editor = page.locator('[aria-label="Cypher query editor"]')
    await expect(editor).toBeVisible()
    await editor.click()
    await editor.press('ControlOrMeta+a')
    await editor.fill('MATCH (n) RETURN n LIMIT 10')

    await page.getByRole('button', { name: /run/i }).click()
    await expect(page.getByText(/^\d+\s+nodes$/).first()).toBeVisible({ timeout: 10000 })
    await page.screenshot({ path: 'e2e/screenshots/app-after-query-light.png' })
  })
})
