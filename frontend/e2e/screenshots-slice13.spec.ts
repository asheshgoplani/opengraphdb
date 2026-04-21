/**
 * Slice-13 screenshot capture for fresh-eyes review.
 *
 * Emits five PNGs under /tmp/ux-slice13/:
 *   01-playground-community.png — 6+ hues visible on canvas
 *   02-schema.png               — schema panel, distinct from MCP
 *   03-mcp.png                  — MCP tool gallery panel
 *   04-labels-closeup.png       — tight crop showing halo + no overlap
 *   05-landing-hero-clean.png   — italic "built for the way" crisp
 */

import { mkdirSync } from 'node:fs'
import { test } from '@playwright/test'

const OUT = '/tmp/ux-slice13'
mkdirSync(OUT, { recursive: true })

async function settleCanvas(page: import('@playwright/test').Page) {
  const canvas = page.locator('canvas').first()
  await canvas.waitFor({ state: 'attached', timeout: 10_000 })
  await page.waitForTimeout(6_000)
}

test('slice13 — 01 playground community (8 hues)', async ({ page }) => {
  await page.goto('/playground?dataset=community')
  await settleCanvas(page)
  await page.screenshot({ path: `${OUT}/01-playground-community.png`, fullPage: false })
})

test('slice13 — 02 schema tab distinct from MCP', async ({ page }) => {
  await page.goto('/playground?dataset=community')
  await settleCanvas(page)
  const tab = page.getByRole('tab', { name: 'Schema' })
  await tab.click()
  await page.locator('[data-testid="schema-main-panel"]').waitFor({ state: 'visible', timeout: 5_000 })
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/02-schema.png`, fullPage: false })
})

test('slice13 — 03 mcp tab', async ({ page }) => {
  await page.goto('/playground?dataset=community')
  await settleCanvas(page)
  const tab = page.getByRole('tab', { name: 'MCP' })
  await tab.click()
  await page.locator('[data-testid="mcp-main-panel"]').waitFor({ state: 'visible', timeout: 5_000 })
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/03-mcp.png`, fullPage: false })
})

test('slice13 — 04 labels closeup (halo + no overlap)', async ({ page }) => {
  await page.goto('/playground?dataset=community')
  await settleCanvas(page)
  // Tight 560×360 crop in the upper-left cluster region where labels are
  // dense enough to stress-test collision.
  await page.screenshot({
    path: `${OUT}/04-labels-closeup.png`,
    clip: { x: 360, y: 180, width: 560, height: 360 },
  })
})

test('slice13 — 05 landing hero clean (italic crisp)', async ({ page }) => {
  await page.goto('/')
  // Hero has a cooldown on the constellation + reveal animations; wait long
  // enough for reveal-up to finish and the hero-shimmer opacity to stabilise.
  await page.waitForTimeout(2_600)
  await page.screenshot({ path: `${OUT}/05-landing-hero-clean.png`, fullPage: false })
})
