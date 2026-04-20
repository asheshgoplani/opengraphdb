import { test } from '@playwright/test'

// One-off screenshot capture for /tmp/ux-slice8 — three temporal slider states.

test.use({ viewport: { width: 1920, height: 1080 } })

test.describe('Slice 8 screenshots', () => {
  test('temporal slider — min, mid, max', async ({ page }) => {
    await page.goto('/playground?dataset=movielens')
    await page.waitForLoadState('networkidle')

    await page.getByRole('tab', { name: /Temporal/i }).click()
    const slider = page.getByRole('slider', { name: /time cutoff/i })
    await slider.focus()
    // Settle layout for a beat so canvas finishes its first force-tick.
    await page.waitForTimeout(800)

    // Max (now): no presses needed — initial value is range.max.
    await page.screenshot({ path: '/tmp/ux-slice8/01-slider-max-now.png', fullPage: false })

    // Mid: scrub back roughly halfway across the year span (1957..2019 = 62 steps).
    for (let i = 0; i < 31; i += 1) {
      await slider.press('ArrowLeft')
    }
    await page.waitForTimeout(300)
    await page.screenshot({ path: '/tmp/ux-slice8/02-slider-mid-scrub.png', fullPage: false })

    // Min (oldest): scrub all the way back.
    for (let i = 0; i < 80; i += 1) {
      await slider.press('ArrowLeft')
    }
    await page.waitForTimeout(300)
    await page.screenshot({ path: '/tmp/ux-slice8/03-slider-min-oldest.png', fullPage: false })

    // Bonus: trigger compact-history then capture diff.
    await page.getByTestId('compact-history-btn').click()
    await page.waitForSelector('[data-testid="compact-history-diff"]')
    await page.screenshot({ path: '/tmp/ux-slice8/04-compact-history-diff.png', fullPage: false })
  })
})
