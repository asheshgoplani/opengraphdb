import { expect, test } from '@playwright/test'

test.describe('Token-leak cleanup', () => {
  test('playground respects palette flip (light vs dark)', async ({ page }) => {
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')
    await page.locator('header').waitFor({ state: 'visible' })
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    const headerBg = await page.evaluate(() => {
      const el = document.querySelector('header')!
      return getComputedStyle(el).backgroundColor
    })
    // dark amber-terminal card: hsl(24 16% 11%) → rgb(33, 27, 22) ish.
    // bg-card/80 yields rgba(...); accept either rgb()/rgba() and a
    // first-channel range that covers the warm-amber dark card.
    expect(headerBg).toMatch(/^rgba?\(3\d, 2\d, 2\d/)
    await page.evaluate(() => document.documentElement.classList.remove('dark'))
    const headerBgLight = await page.evaluate(() => {
      const el = document.querySelector('header')!
      return getComputedStyle(el).backgroundColor
    })
    // light amber-terminal card: hsl(40 30% 99%) → rgb(253, 253, 252) ish.
    // bg-card/80 yields rgba(...); accept either rgb()/rgba() and the
    // pale-warm channel range that the AMBER-TERMINAL light card resolves to.
    expect(headerBgLight).toMatch(/^rgba?\(25\d, 25\d, 2[45]\d/)
  })
})
