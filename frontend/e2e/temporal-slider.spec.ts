import { expect, test } from '@playwright/test'

// RED test for PLAN slice S8: Temporal query demo + time slider.
// Expected to FAIL today — no Temporal tab or TimeSlider exists.
// Goes GREEN when slice 8 lands.

test.describe('Playground premium — S8 temporal slider', () => {
  test('Temporal tab exposes a time slider over MovieLens', async ({ page }) => {
    await page.goto('/playground?dataset=movielens')
    await page.waitForLoadState('networkidle')

    await page.getByRole('tab', { name: /Temporal/i }).click()

    const slider = page.getByRole('slider', { name: /time cutoff/i })
    await expect(slider).toBeVisible()
  })

  test('Sliding back in time reduces the visible node count', async ({ page }) => {
    await page.goto('/playground?dataset=movielens')
    await page.waitForLoadState('networkidle')

    const footerNodes = page.getByTestId('footer-node-count')
    await expect(footerNodes).toBeVisible()
    const initialText = (await footerNodes.textContent()) ?? ''
    const initialCount = parseInt(initialText.replace(/\D/g, ''), 10)
    expect(initialCount).toBeGreaterThan(0)

    await page.getByRole('tab', { name: /Temporal/i }).click()
    const slider = page.getByRole('slider', { name: /time cutoff/i })
    await slider.focus()
    // Scrub the slider all the way back with keyboard arrows
    for (let i = 0; i < 40; i += 1) {
      await slider.press('ArrowLeft')
    }

    const finalText = (await footerNodes.textContent()) ?? ''
    const finalCount = parseInt(finalText.replace(/\D/g, ''), 10)
    expect(finalCount).toBeLessThan(initialCount)
  })
})
