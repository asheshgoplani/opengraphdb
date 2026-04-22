/**
 * Slice-15 gate 3: edge color map exposed to JS via
 * `window.__COSMOS_DEBUG.edgeColors`.
 *
 * WebGL pixel sampling is unreliable under SwiftShader-headless, so we
 * assert the data the canvas rendered FROM instead of the pixels it
 * produced: when CosmosCanvas builds `linkColors` via
 * `colorForEdgeType(...)`, it now ALSO writes a
 *   { [edgeType]: { hex, rgba, alpha } }
 * map onto `window.__COSMOS_DEBUG.edgeColors`. The gate then confirms:
 *   - ≥ 8 entries (one per edge type in the community dataset + fallbacks)
 *   - ≥ 4 distinct hex values
 *   - every alpha ≥ 0.75
 */

import { expect, test } from '@playwright/test'

type EdgeColorEntry = { hex: string; rgba: [number, number, number, number]; alpha: number }

declare global {
  interface Window {
    __COSMOS_DEBUG?: {
      edgeColors?: Record<string, EdgeColorEntry>
    }
  }
}

test('slice15 gate3 — window.__COSMOS_DEBUG.edgeColors has ≥8 entries, ≥4 distinct hex, all alpha ≥0.75', async ({
  page,
}) => {
  await page.goto('/playground?dataset=community')
  await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 10_000 })
  // Allow the color-writing effect to run on first render.
  await page.waitForTimeout(2_500)

  const edgeColors = await page.evaluate(() => window.__COSMOS_DEBUG?.edgeColors)
  console.log('[slice15-edge-debug] edgeColors:', JSON.stringify(edgeColors))

  expect(edgeColors).toBeTruthy()
  const entries = Object.entries(edgeColors ?? {})
  console.log('[slice15-edge-debug] entry count:', entries.length)
  expect(entries.length).toBeGreaterThanOrEqual(8)

  const distinctHex = new Set<string>()
  for (const [type, info] of entries) {
    expect(typeof type).toBe('string')
    expect(info.hex).toMatch(/^#[0-9A-Fa-f]{6}$/)
    expect(Array.isArray(info.rgba)).toBe(true)
    expect(info.rgba).toHaveLength(4)
    expect(info.alpha).toBeGreaterThanOrEqual(0.75)
    distinctHex.add(info.hex.toLowerCase())
  }
  console.log('[slice15-edge-debug] distinct hex count:', distinctHex.size)
  expect(distinctHex.size).toBeGreaterThanOrEqual(4)
})
