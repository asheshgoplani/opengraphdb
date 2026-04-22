/**
 * Slice-15 gate 1: Schema tab header, verified via DOM (not pixel diff).
 *
 * Iter-6 review finding: reviewer still reports "Schema header missing"
 * despite slice-14 adding a 32px Fraunces header. The gap is that our
 * previous E2E only asserted `data-testid="schema-header-bar"`; the
 * reviewer's spec calls it `data-testid="schema-browser-header"`. We
 * add that testid + harden the visibility / computed-style asserts and
 * also prove the header is NOT present on the MCP tab.
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

test('slice15 gate1 — schema tab renders visible schema-browser-header with correct computed style', async ({
  page,
}) => {
  await gotoPlayground(page)
  await clickTab(page, 'Schema')

  const header = page.locator('[data-testid="schema-browser-header"]')
  await expect(header).toBeVisible({ timeout: 3_000 })

  // Visibility: display != none, opacity > 0, box > 400px wide.
  const snapshot = await header.evaluate((el) => {
    const cs = getComputedStyle(el)
    const rect = el.getBoundingClientRect()
    return {
      display: cs.display,
      opacity: parseFloat(cs.opacity),
      width: rect.width,
      height: rect.height,
      zIndex: cs.zIndex,
    }
  })
  console.log('[slice15-schema-header] container snapshot:', JSON.stringify(snapshot))
  expect(snapshot.display).not.toBe('none')
  expect(snapshot.opacity).toBeGreaterThan(0)
  expect(snapshot.width).toBeGreaterThan(400)
  // z-index accessor returns a string — parse it; must be > 10.
  const z = parseInt(snapshot.zIndex || '0', 10)
  expect(z).toBeGreaterThan(10)

  // The <h1> inside the header carries the Fraunces face + ≥28px size.
  const h1 = header.locator('h1').first()
  const h1Style = await h1.evaluate((el) => {
    const cs = getComputedStyle(el)
    return { fontSize: cs.fontSize, fontFamily: cs.fontFamily }
  })
  console.log('[slice15-schema-header] h1 style:', JSON.stringify(h1Style))
  expect(parseFloat(h1Style.fontSize)).toBeGreaterThanOrEqual(28)
  expect(h1Style.fontFamily.toLowerCase()).toContain('fraunces')
})

test('slice15 gate1 — MCP tab does NOT render schema-browser-header', async ({ page }) => {
  await gotoPlayground(page)
  await clickTab(page, 'MCP')

  const header = page.locator('[data-testid="schema-browser-header"]')
  const count = await header.count()
  console.log('[slice15-schema-header] header count on MCP tab:', count)
  // Either 0 (unmounted by AnimatePresence mode="wait") or present-but-hidden.
  if (count === 0) {
    expect(count).toBe(0)
  } else {
    const hidden = await header.evaluate((el) => {
      const cs = getComputedStyle(el)
      return cs.display === 'none' || parseFloat(cs.opacity) === 0
    })
    expect(hidden).toBe(true)
  }
})
