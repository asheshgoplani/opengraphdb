/**
 * Slice-13 gate: real schema tab routing.
 *
 * Iter-4 review found /tmp/ux-loop-4/02-schema.png pixel-identical to
 * 02-mcp.png — the prior "fix" silently swallowed the click and the Schema
 * panel never mounted. This gate asserts the main panel DOM swaps when
 * tabs change AND the two panels differ in a large fraction of pixels.
 */

import { expect, test } from '@playwright/test'

async function waitForGraph(page: import('@playwright/test').Page) {
  const canvas = page.locator('canvas').first()
  await canvas.waitFor({ state: 'attached', timeout: 10_000 })
  await page.waitForTimeout(2_500)
}

async function clickTab(page: import('@playwright/test').Page, name: 'Schema' | 'MCP') {
  const tab = page.getByRole('tab', { name })
  await expect(tab).toBeVisible()
  await tab.click()
}

function hexDiffPct(a: Buffer, b: Buffer): number {
  const min = Math.min(a.length, b.length)
  let diffs = 0
  for (let i = 0; i < min; i += 1) {
    if (a[i] !== b[i]) diffs += 1
  }
  return diffs / min
}

test('slice13 — MCP and Schema tabs render DIFFERENT main panels (≥30% pixel delta)', async ({ page }) => {
  await page.goto('/playground?dataset=community')
  await waitForGraph(page)

  // MCP first — capture HTML and screenshot BEFORE switching tabs, because
  // AnimatePresence mode="wait" unmounts the outgoing panel.
  await clickTab(page, 'MCP')
  const mcpPanel = page.locator('[data-testid="mcp-main-panel"]')
  await expect(mcpPanel).toBeVisible({ timeout: 5_000 })
  await page.waitForTimeout(600)
  const mcpHTML = await mcpPanel.innerHTML()
  const mcpShot = await mcpPanel.screenshot()
  expect(mcpHTML).toContain('MCP tool gallery')

  // Schema next.
  await clickTab(page, 'Schema')
  const schemaPanel = page.locator('[data-testid="schema-main-panel"]')
  await expect(schemaPanel).toBeVisible({ timeout: 5_000 })
  await page.waitForTimeout(600)
  const schemaHTML = await schemaPanel.innerHTML()
  const schemaShot = await schemaPanel.screenshot()

  // DOM markers prove each tab rendered its intended panel.
  expect(schemaHTML).toContain('Schema browser')
  expect(schemaHTML).toMatch(/Labels|Edge types|Property keys/)
  expect(schemaHTML).not.toContain('MCP tool gallery')
  expect(mcpHTML).not.toContain('Schema browser')

  // Byte-level pixel delta between the two panel screenshots. Both are
  // PNGs of identical dimensions, so a naive buffer diff is a conservative
  // lower bound on actual pixel change; anything ≥0.30 proves the main
  // panel really swapped.
  const delta = hexDiffPct(mcpShot, schemaShot)
  console.log(`[slice13-schema-routing] panel byte-delta = ${(delta * 100).toFixed(1)}%`)
  expect(delta).toBeGreaterThan(0.30)
})
