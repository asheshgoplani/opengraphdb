/**
 * RED GATE — fix-cosmos-canvas-race (Phase 2).
 *
 * Opens /playground, waits up to 3s for the main graph canvas to acquire
 * non-background pixels in its center region, and asserts the fraction is
 * above 5%. On current main this FAILS because `CosmosCanvas`'s `fitViewOnInit`
 * races `setPointPositions` and leaves the canvas black for 14+ seconds.
 *
 * See: .planning/fix-cosmos-canvas-race/PLAN.md
 */

import { expect, test } from '@playwright/test'
import { PNG } from 'pngjs'

test.describe('cosmos canvas — first-paint gate', () => {
  test('graph canvas has >5% non-background pixels within 3s of /playground load', async ({
    page,
  }) => {
    await page.goto('/playground')

    // Wait only for the canvas element to attach. NOT networkidle — the whole
    // point is to catch cases where the canvas stays black despite being attached.
    const canvas = page.locator('canvas').first()
    await canvas.waitFor({ state: 'attached', timeout: 5_000 })

    const box = await canvas.boundingBox()
    if (!box) throw new Error('canvas has no bounding box')

    const CROP = 200
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    const clip = {
      x: Math.max(0, Math.round(cx - CROP / 2)),
      y: Math.max(0, Math.round(cy - CROP / 2)),
      width: CROP,
      height: CROP,
    }

    // Wait budget: 3 seconds. Sample the center every 150ms and check if it
    // has non-background pixel variance; fail if we never cross 5%.
    const DEADLINE = Date.now() + 3_000
    const THRESHOLD = 0.05
    let bestFraction = 0

    while (Date.now() < DEADLINE) {
      const buf = await page.screenshot({ clip, type: 'png' })
      const img = PNG.sync.read(buf)

      // "Background" for this viewport = the darkest corner pixel of the crop.
      // Cosmos's WebGL canvas has transparent bg; the radial-gradient div
      // behind it gives a consistent dark color at the crop edges.
      const [br, bg, bb] = [
        img.data[0],
        img.data[1],
        img.data[2],
      ]

      let nonBg = 0
      let total = 0
      for (let i = 0; i < img.data.length; i += 4) {
        const r = img.data[i]
        const g = img.data[i + 1]
        const b = img.data[i + 2]
        const dr = r - br
        const dg = g - bg
        const db = b - bb
        // Euclidean RGB distance^2, threshold ~ 40 per channel.
        if (dr * dr + dg * dg + db * db > 40 * 40) nonBg += 1
        total += 1
      }

      const fraction = nonBg / total
      if (fraction > bestFraction) bestFraction = fraction
      if (fraction >= THRESHOLD) {
        // Success: stop sampling.
        expect(fraction).toBeGreaterThanOrEqual(THRESHOLD)
        return
      }

      await page.waitForTimeout(150)
    }

    // Ran out of budget without reaching the threshold — RED.
    throw new Error(
      `canvas stayed blank: best non-background pixel fraction was ` +
        `${(bestFraction * 100).toFixed(2)}% within 3s, need ≥ ${(THRESHOLD * 100).toFixed(0)}%`,
    )
  })
})
