import { expect, test } from '@playwright/test'

test.describe('AMBER-TERMINAL palette', () => {
  test('dark mode primary HSL is amber', async ({ page }) => {
    await page.goto('/playground')
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    const primary = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
    )
    expect(primary).toBe('40 95% 62%')
  })

  test('color-scheme is set on .dark', async ({ page }) => {
    await page.goto('/playground')
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    const cs = await page.evaluate(() =>
      getComputedStyle(document.documentElement).colorScheme,
    )
    expect(cs).toContain('dark')
  })

  test('theme-color meta exists and is dark', async ({ page }) => {
    await page.goto('/')
    const themeColor = await page
      .locator('meta[name="theme-color"][media*="dark"]')
      .getAttribute('content')
    expect(themeColor).toBeTruthy()
    expect(themeColor!.toLowerCase()).toMatch(/^#0|^#1|^hsl\(24/)
  })

  test('reduced-motion query disables transitions', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    const dur = await page.evaluate(() => {
      const el = document.querySelector('h1')!
      return getComputedStyle(el).animationDuration
    })
    expect(dur).toBe('0.01ms')
  })
})
