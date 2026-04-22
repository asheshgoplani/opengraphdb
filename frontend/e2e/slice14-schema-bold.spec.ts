/**
 * Slice-14 gate: Schema tab is UNMISTAKABLE.
 *
 * Iter-5 review finding: even after slice-13's real schema routing, the
 * /playground Schema tab still looked "too similar" to MCP — the reviewer
 * couldn't instantly tell which tab was active from a screenshot. The
 * left-rail sidebar is identical across all tabs so it carries no signal.
 *
 * Slice-14 fix (verified via DOM/CSS, not pixel diff):
 *   - The Schema panel contains a sticky header bar with
 *     data-testid="schema-browser-header" that is visible.
 *   - The header text literally reads "SCHEMA BROWSER" (upper-case).
 *   - The header's computed `font-size` is ≥ 28px and `font-family`
 *     includes Fraunces (the display serif).
 *   - The panel carries `data-schema-mode="active"` so any screenshot
 *     differ / reviewer can distinguish schema-mode from non-schema.
 *   - The header is NOT rendered in the MCP panel (confirms tint is
 *     schema-specific, not bleeding across tabs).
 */

import { expect, test } from '@playwright/test'

async function gotoPlayground(page: import('@playwright/test').Page) {
  await page.goto('/playground?dataset=community')
  await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 10_000 })
  await page.waitForTimeout(1_500)
}

async function clickTab(
  page: import('@playwright/test').Page,
  name: 'Schema' | 'MCP' | 'Graph',
) {
  const tab = page.getByRole('tab', { name })
  await expect(tab).toBeVisible()
  await tab.click()
  await page.waitForTimeout(500)
}

test('slice14 — Schema tab shows a 32px Fraunces "SCHEMA BROWSER" header', async ({ page }) => {
  await gotoPlayground(page)
  await clickTab(page, 'Schema')

  const panel = page.locator('[data-testid="schema-main-panel"]')
  await expect(panel).toBeVisible({ timeout: 5_000 })
  await expect(panel).toHaveAttribute('data-schema-mode', 'active')

  const header = page.locator('[data-testid="schema-browser-header"]')
  await expect(header).toBeVisible({ timeout: 2_000 })

  const headerText = await header.textContent()
  expect(headerText ?? '').toContain('SCHEMA BROWSER')

  // The <h1> inside the header is the big Fraunces type.
  const h1 = header.locator('h1').first()
  const fontSize = await h1.evaluate((el) => getComputedStyle(el).fontSize)
  const fontFamily = await h1.evaluate((el) => getComputedStyle(el).fontFamily)
  console.log(
    `[slice14-schema-bold] h1 font-size=${fontSize}, family=${fontFamily}`,
  )
  const sizePx = parseFloat(fontSize)
  expect(sizePx).toBeGreaterThanOrEqual(28)
  expect(fontFamily.toLowerCase()).toContain('fraunces')
})

test('slice14 — MCP tab does NOT render the schema header', async ({ page }) => {
  await gotoPlayground(page)
  await clickTab(page, 'MCP')

  const mcp = page.locator('[data-testid="mcp-main-panel"]')
  await expect(mcp).toBeVisible({ timeout: 5_000 })

  // Schema header must be absent (AnimatePresence mode="wait" unmounts the
  // outgoing schema panel, so nothing with that testid should be in DOM).
  const header = page.locator('[data-testid="schema-browser-header"]')
  await expect(header).toHaveCount(0)
  await expect(mcp).not.toHaveAttribute('data-schema-mode', 'active')
})

test('slice14 — Schema panel has distinct background (mint tint) vs MCP panel', async ({ page }) => {
  await gotoPlayground(page)

  // Capture MCP panel background first.
  await clickTab(page, 'MCP')
  const mcpBg = await page
    .locator('[data-testid="mcp-main-panel"]')
    .evaluate((el) => getComputedStyle(el).backgroundImage + ' | ' + getComputedStyle(el).backgroundColor)

  // Switch to Schema and capture its background.
  await clickTab(page, 'Schema')
  const schemaBg = await page
    .locator('[data-testid="schema-main-panel"]')
    .evaluate((el) => getComputedStyle(el).backgroundImage + ' | ' + getComputedStyle(el).backgroundColor)

  console.log(`[slice14-schema-bold] mcpBg=${mcpBg}`)
  console.log(`[slice14-schema-bold] schemaBg=${schemaBg}`)

  // Schema panel must render a linear-gradient (the mint tint). MCP uses
  // a plain color (bg-background/60 utility).
  expect(schemaBg).toContain('linear-gradient')
  expect(schemaBg).not.toEqual(mcpBg)
})
