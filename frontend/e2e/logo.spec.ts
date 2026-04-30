import { expect, test } from '@playwright/test'

test('Logo component renders inline SVG with currentColor', async ({ page }) => {
  await page.goto('http://localhost:5173/')
  const svg = page.locator('header svg[data-logo="opengraphdb-mark"]').first()
  await expect(svg).toBeVisible()
  const fill = await svg.locator('circle').first().getAttribute('fill')
  expect(fill).toBe('currentColor')
})

test('favicon points at logo-mark-16.svg', async ({ page }) => {
  await page.goto('http://localhost:5173/')
  const href = await page.locator('link[rel="icon"]').first().getAttribute('href')
  expect(href).toMatch(/logo-mark/)
})
