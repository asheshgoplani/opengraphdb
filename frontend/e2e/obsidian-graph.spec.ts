import { expect, test } from '@playwright/test'

test.describe('Obsidian-style graph viz', () => {
  test('renders force-graph canvas with nodes', async ({ page }) => {
    await page.goto('/playground')
    await page.waitForSelector('canvas[data-graph="obsidian"]', { timeout: 20_000 })
    const canvas = page.locator('canvas[data-graph="obsidian"]')
    await expect(canvas).toBeVisible()
    const dim = await canvas.boundingBox()
    expect(dim!.width).toBeGreaterThan(400)
  })

  test('hover dims non-neighbors', async ({ page }) => {
    await page.goto('/playground')
    await page.waitForFunction(() => (window as unknown as { __obsidianGraphReady?: boolean }).__obsidianGraphReady === true, { timeout: 20_000 })
    await page.evaluate(() =>
      (window as unknown as { __obsidianHoverNode?: (i: number) => void }).__obsidianHoverNode?.(0),
    )
    const dimmed = await page.evaluate(
      () => (window as unknown as { __obsidianDimmedCount?: () => number }).__obsidianDimmedCount?.() ?? 0,
    )
    expect(dimmed).toBeGreaterThan(0)
  })

  test('reset-camera button is keyboard-reachable', async ({ page }) => {
    await page.goto('/playground')
    await page.waitForSelector('button[aria-label="Reset view"]', { timeout: 20_000 })
    const btn = page.locator('button[aria-label="Reset view"]')
    await expect(btn).toBeVisible()
    await btn.focus()
    expect(await btn.evaluate((el) => el === document.activeElement)).toBe(true)
  })
})
