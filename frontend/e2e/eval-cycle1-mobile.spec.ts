import { expect, test } from '@playwright/test'

test('H18: /playground does not overflow horizontally at 375 px', async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, 'innerWidth', { value: 375 })
  })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/playground')
  await page.waitForLoadState('domcontentloaded')

  const docW = await page.evaluate(() => document.documentElement.scrollWidth)
  const winW = await page.evaluate(() => window.innerWidth)
  expect(docW, `documentElement.scrollWidth=${docW} > windowW=${winW}`).toBeLessThanOrEqual(winW + 2)
})
