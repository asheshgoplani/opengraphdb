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
    // Chromium normalizes the override to seconds: 0.01ms === 1e-05s.
    // Either string is valid — we just need the duration to be effectively zero.
    expect(dur).toMatch(/^(0\.01ms|1e-05s)$/)
  })

  test('landing hero background is amber-terminal warm bg, not cosmos navy', async ({ page }) => {
    await page.goto('/')
    const heroBg = await page.evaluate(() => {
      const hero = document.querySelector('section[aria-labelledby="hero-heading"]') as HTMLElement | null
      if (!hero) return null
      return getComputedStyle(hero).backgroundColor
    })
    expect(heroBg).not.toBeNull()
    // hsl(240, 28%, 7%) → rgb(13, 13, 23) — the cosmos-navy literal we are removing.
    expect(heroBg).not.toBe('rgb(13, 13, 23)')
    // AMBER-TERMINAL --background (dark) is hsl(24, 18%, 7%) → ~rgb(21, 17, 15).
    // The defining property: red channel ≥ blue channel (warm, not cool).
    const m = heroBg!.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    expect(m).not.toBeNull()
    const [r, , b] = [Number(m![1]), Number(m![2]), Number(m![3])]
    expect(r).toBeGreaterThanOrEqual(b)
  })
})
