/**
 * Slice 12 screenshot capture — one-shot artefact generation for
 * fresh-eyes review. Produces PNGs under /tmp/ux-slice12/.
 */

import { mkdirSync } from 'node:fs'
import { test } from '@playwright/test'

const OUT = '/tmp/ux-slice12'
mkdirSync(OUT, { recursive: true })

async function settleCanvas(page: import('@playwright/test').Page) {
  const canvas = page.locator('canvas').first()
  await canvas.waitFor({ state: 'attached', timeout: 6_000 })
  await page.waitForTimeout(5_000)
}

test('slice12 — playground community graph', async ({ page }) => {
  await page.goto('/playground?dataset=community')
  await settleCanvas(page)
  await page.screenshot({ path: `${OUT}/01-playground-community.png`, fullPage: false })
})

test('slice12 — playground movielens', async ({ page }) => {
  await page.goto('/playground?dataset=movielens')
  await settleCanvas(page)
  await page.screenshot({ path: `${OUT}/02-playground-movielens.png`, fullPage: false })
})

test('slice12 — landing hero', async ({ page }) => {
  await page.goto('/')
  await page.waitForTimeout(1_800)
  await page.screenshot({ path: `${OUT}/03-landing.png`, fullPage: false })
})

test('slice12 — schema tab (FIXED to be distinct from MCP)', async ({ page }) => {
  await page.goto('/playground?dataset=community')
  await settleCanvas(page)
  await page.getByRole('tab', { name: 'Schema' }).click().catch(() => {})
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/04-schema-tab-FIXED.png`, fullPage: false })
})
