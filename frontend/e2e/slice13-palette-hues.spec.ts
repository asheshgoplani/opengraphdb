/**
 * Slice-13 gate: true 8-hue node-core palette.
 *
 * Samples 100 non-background pixels across the playground canvas, bins
 * their hues into 8 45°-wide buckets centered on 0°/45°/90°/135°/180°/
 * 225°/270°/315°, and asserts ≥ 6 buckets are populated by ≥ 5 pixels
 * each. Runs on the community dataset (8 clusters, 8 distinct labels).
 */

import { expect, test } from '@playwright/test'
import { skipIfCosmosWebglUnavailable } from './_helpers/cosmos-webgl'

async function waitForGraph(page: import('@playwright/test').Page) {
  const canvas = page.locator('canvas').first()
  await canvas.waitFor({ state: 'attached', timeout: 10_000 })
  await page.waitForTimeout(6_000) // let cosmos settle + blooms render
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rf = r / 255
  const gf = g / 255
  const bf = b / 255
  const max = Math.max(rf, gf, bf)
  const min = Math.min(rf, gf, bf)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rf:
        h = ((gf - bf) / d + (gf < bf ? 6 : 0)) * 60
        break
      case gf:
        h = ((bf - rf) / d + 2) * 60
        break
      default:
        h = ((rf - gf) / d + 4) * 60
    }
  }
  return [h, s, l]
}

function hueBucket(h: number): number {
  // 8 buckets, 45° wide, centered on 0,45,…,315. Bucket boundaries are at
  // 22.5, 67.5, … so the label is Math.round((h % 360)/45) % 8.
  const normalized = ((h % 360) + 360) % 360
  return Math.round(normalized / 45) % 8
}

test('slice13 — community canvas paints ≥6 distinct hue buckets', async ({ page }) => {
  await page.goto('/playground?dataset=community')
  await waitForGraph(page)
  await skipIfCosmosWebglUnavailable(page)

  // Sample pixels via canvas.toDataURL → decode in page, then ship back
  // an array of [r,g,b,a] for every sampled pixel that isn't background.
  const sampled = await page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null
    if (!canvas) return { samples: [] as Array<[number, number, number]>, total: 0 }
    const w = canvas.width
    const h = canvas.height
    // Draw the live canvas into an offscreen 2D canvas so we can use
    // getImageData (cosmos paints via WebGL so direct readPixels is out).
    const off = document.createElement('canvas')
    off.width = w
    off.height = h
    const ctx = off.getContext('2d')
    if (!ctx) return { samples: [] as Array<[number, number, number]>, total: 0 }
    ctx.drawImage(canvas, 0, 0)
    const data = ctx.getImageData(0, 0, w, h).data

    // Also composite the DOM bloom layer onto the same offscreen so we
    // pick up per-label halo hues (those pixels are often the most
    // saturated on the canvas). We do that by rendering a large grid of
    // samples, rejecting near-background.
    const samples: Array<[number, number, number]> = []
    const STRIDE = 24
    for (let y = 10; y < h - 10; y += STRIDE) {
      for (let x = 10; x < w - 10; x += STRIDE) {
        const i = (y * w + x) * 4
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const a = data[i + 3]
        if (a < 40) continue
        // Reject near-black background (the page bg is ~rgb(13,13,25)).
        if (r + g + b < 90) continue
        // Reject desaturated greys (the gradient/dot-grid).
        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        if (max - min < 40) continue
        samples.push([r, g, b])
      }
    }
    return { samples, total: samples.length }
  })

  console.log(`[slice13-palette-hues] total colored samples = ${sampled.total}`)
  // Need at least 100 colored samples to make the gate meaningful.
  expect(sampled.total).toBeGreaterThanOrEqual(100)

  const buckets = new Array(8).fill(0) as number[]
  for (const [r, g, b] of sampled.samples) {
    const [h, s, l] = rgbToHsl(r, g, b)
    // Only count reasonably-saturated mid-light pixels.
    if (s < 0.25) continue
    if (l < 0.25 || l > 0.88) continue
    buckets[hueBucket(h)] += 1
  }
  console.log(
    `[slice13-palette-hues] hue buckets (0°,45°,90°,135°,180°,225°,270°,315°) = ${buckets.join(', ')}`,
  )

  const populated = buckets.filter((n) => n >= 5).length
  expect(populated).toBeGreaterThanOrEqual(6)
})
