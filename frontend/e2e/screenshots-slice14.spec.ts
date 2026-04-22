/**
 * Slice-14 screenshot capture for iter-5 fresh-eyes review.
 *
 * Emits under /tmp/ux-slice14/:
 *   01-playground.png  — community canvas with toned-down bloom
 *   02-mcp.png         — MCP tab (baseline for schema-is-different proof)
 *   02-schema.png      — Schema tab with SCHEMA BROWSER header + mint tint
 *   03-landing.png     — landing hero
 */

import { mkdirSync } from 'node:fs'
import { test } from '@playwright/test'

const OUT = '/tmp/ux-slice14'
mkdirSync(OUT, { recursive: true })

async function settleCanvas(page: import('@playwright/test').Page) {
  const canvas = page.locator('canvas').first()
  await canvas.waitFor({ state: 'attached', timeout: 10_000 })
  await page.waitForTimeout(6_000)
}

test('slice14 — 01 playground', async ({ page }) => {
  await page.goto('/playground?dataset=community')
  await settleCanvas(page)
  await page.screenshot({ path: `${OUT}/01-playground.png`, fullPage: false })
})

test('slice14 — 02 mcp tab', async ({ page }) => {
  await page.goto('/playground?dataset=community')
  await settleCanvas(page)
  const tab = page.getByRole('tab', { name: 'MCP' })
  await tab.click()
  await page.locator('[data-testid="mcp-main-panel"]').waitFor({ state: 'visible', timeout: 5_000 })
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/02-mcp.png`, fullPage: false })
})

test('slice14 — 02 schema tab (with SCHEMA BROWSER header)', async ({ page }) => {
  await page.goto('/playground?dataset=community')
  await settleCanvas(page)
  const tab = page.getByRole('tab', { name: 'Schema' })
  await tab.click()
  const panel = page.locator('[data-testid="schema-main-panel"]')
  await panel.waitFor({ state: 'visible', timeout: 5_000 })
  await page.locator('[data-testid="schema-browser-header"]').waitFor({ state: 'visible', timeout: 2_000 })
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/02-schema.png`, fullPage: false })
})

test('slice14 — 03 landing hero', async ({ page }) => {
  await page.goto('/')
  await page.waitForTimeout(2_600)
  await page.screenshot({ path: `${OUT}/03-landing.png`, fullPage: false })
})
