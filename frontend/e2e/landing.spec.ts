import { expect, test, type Page } from '@playwright/test'

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((activeTheme) => {
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(activeTheme)
  }, theme)
}

test.describe('Landing Page Visual Coverage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('renders all primary sections and captures light screenshots', async ({ page }) => {
    const heroTitle = page.getByRole('heading', { level: 1 })
    await expect(heroTitle).toContainText('The single-file graph DB')
    await page.screenshot({ path: 'e2e/screenshots/landing-hero-light.png', fullPage: false })

    const showcaseSection = page.locator('#use-cases')
    await showcaseSection.scrollIntoViewIfNeeded()
    await expect(showcaseSection).toBeVisible()
    await expect(page.getByTestId('showcase-card')).toHaveCount(5)
    await page.screenshot({ path: 'e2e/screenshots/landing-showcase-light.png', fullPage: false })

    const featuresSection = page.locator('#features')
    await featuresSection.scrollIntoViewIfNeeded()
    await expect(featuresSection).toBeVisible()
    await expect(page.getByTestId('feature-card')).toHaveCount(4)
    await page.screenshot({ path: 'e2e/screenshots/landing-features-light.png', fullPage: false })

    const gettingStartedSection = page.locator('#get-started')
    await gettingStartedSection.scrollIntoViewIfNeeded()
    await expect(gettingStartedSection).toBeVisible()
    await expect(gettingStartedSection.locator('ol > li')).toHaveCount(3)
    await page.screenshot({ path: 'e2e/screenshots/landing-getting-started-light.png', fullPage: false })

    await expect(page.locator('header a[href="/playground"]').first()).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/landing-full-light.png', fullPage: true })
  })

  test('captures full page dark mode screenshot', async ({ page }) => {
    await setTheme(page, 'dark')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/landing-full-dark.png', fullPage: true })
  })

  test('showcase cards navigate to playground', async ({ page }) => {
    await page.locator('#use-cases').scrollIntoViewIfNeeded()
    await page.locator('#use-cases a[href*="/playground?dataset="]').first().click()
    await expect(page).toHaveURL(/\/playground\?dataset=/)
  })
})
