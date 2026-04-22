/**
 * Slice-15 gate 2: node palette + bloom opacity exposed to JS so the gate
 * verifies intent, not WebGL pixels (SwiftShader-headless renders nodes
 * unreliably).
 *
 * - `window.__NODE_PALETTE` is an array of ≥8 entries, each with
 *   { label, hsl: [h,s,l], hex }. Saturation ≥ 0.7 and lightness ≥ 0.5.
 * - Pairwise hue delta ≥ 30° for at least 6 pairs — proves the palette
 *   spans the wheel.
 * - `--bloom-opacity` CSS var on :root resolves to ≤ 0.35, capping how
 *   much the halo can wash over the saturated node core.
 */

import { expect, test } from '@playwright/test'

declare global {
  interface Window {
    __NODE_PALETTE?: Array<{
      label: string
      hsl: [number, number, number]
      hex: string
    }>
  }
}

test('slice15 gate2 — window.__NODE_PALETTE exposes ≥8 saturated, varied colors', async ({
  page,
}) => {
  await page.goto('/playground?dataset=community')
  await page.waitForTimeout(1_000)

  const palette = await page.evaluate(() => window.__NODE_PALETTE)
  console.log('[slice15-palette] palette length:', palette?.length)
  console.log('[slice15-palette] palette:', JSON.stringify(palette))

  expect(Array.isArray(palette)).toBe(true)
  expect(palette!.length).toBeGreaterThanOrEqual(8)

  // Each entry must be well-formed and pass saturation/lightness floor.
  for (const entry of palette!) {
    expect(typeof entry.label).toBe('string')
    expect(entry.label.length).toBeGreaterThan(0)
    expect(entry.hex).toMatch(/^#[0-9A-Fa-f]{6}$/)
    expect(entry.hsl).toHaveLength(3)
    const [h, s, l] = entry.hsl
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThanOrEqual(360)
    expect(s).toBeGreaterThanOrEqual(0.7)
    expect(l).toBeGreaterThanOrEqual(0.5)
  }

  // Pairwise hue delta — at least 6 pairs with ≥30° separation.
  const hues = palette!.map((p) => p.hsl[0])
  let widePairs = 0
  for (let i = 0; i < hues.length; i += 1) {
    for (let j = i + 1; j < hues.length; j += 1) {
      const raw = Math.abs(hues[i] - hues[j])
      const delta = Math.min(raw, 360 - raw)
      if (delta >= 30) widePairs += 1
    }
  }
  console.log('[slice15-palette] pairs with ≥30° hue delta:', widePairs)
  expect(widePairs).toBeGreaterThanOrEqual(6)
})

test('slice15 gate2 — --bloom-opacity CSS var resolves to ≤0.35', async ({ page }) => {
  await page.goto('/playground?dataset=community')
  await page.waitForTimeout(500)

  const bloomOpacity = await page.evaluate(() => {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--bloom-opacity')
      .trim()
    return { raw, value: parseFloat(raw) }
  })
  console.log('[slice15-palette] --bloom-opacity:', JSON.stringify(bloomOpacity))
  expect(bloomOpacity.raw).not.toBe('')
  expect(Number.isFinite(bloomOpacity.value)).toBe(true)
  expect(bloomOpacity.value).toBeLessThanOrEqual(0.35)
  expect(bloomOpacity.value).toBeGreaterThan(0)
})
