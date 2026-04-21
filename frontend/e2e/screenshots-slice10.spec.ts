/**
 * Slice 10 screenshot capture — written for one-shot artefact generation,
 * not for regression testing. Produces PNGs under /tmp/ux-slice10/.
 */

import { mkdirSync } from 'node:fs'
import { test } from '@playwright/test'

const OUT = '/tmp/ux-slice10'
mkdirSync(OUT, { recursive: true })

async function settleCanvas(page: import('@playwright/test').Page) {
  const canvas = page.locator('canvas').first()
  await canvas.waitFor({ state: 'attached', timeout: 6_000 })
  await page.waitForTimeout(4_500)
}

test('slice10 — playground default community graph (dense + spread)', async ({ page }) => {
  await page.goto('/playground?dataset=community')
  await settleCanvas(page)
  await page.screenshot({ path: `${OUT}/01-playground-community.png`, fullPage: false })
})

test('slice10 — playground MovieLens', async ({ page }) => {
  await page.goto('/playground?dataset=movielens')
  await settleCanvas(page)
  await page.screenshot({ path: `${OUT}/02-playground-movielens.png`, fullPage: false })
})

test('slice10 — playground GoT', async ({ page }) => {
  await page.goto('/playground?dataset=got')
  await settleCanvas(page)
  await page.screenshot({ path: `${OUT}/03-playground-got.png`, fullPage: false })
})

test('slice10 — semantic tab (MovieLens)', async ({ page }) => {
  await page.goto('/playground?dataset=movielens')
  await settleCanvas(page)
  await page.getByRole('tab', { name: 'Semantic' }).click().catch(() => {})
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/04-semantic.png`, fullPage: false })
})

test('slice10 — temporal tab (GoT)', async ({ page }) => {
  await page.goto('/playground?dataset=got')
  await settleCanvas(page)
  await page.getByRole('tab', { name: 'Temporal' }).click().catch(() => {})
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/05-temporal.png`, fullPage: false })
})

test('slice10 — schema browser filter + hover', async ({ page }) => {
  await page.goto('/playground?dataset=community')
  await settleCanvas(page)
  const canvas = page.locator('canvas').first()
  const box = await canvas.boundingBox()
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(400)
  }
  await page.screenshot({ path: `${OUT}/06-hover.png`, fullPage: false })
})
