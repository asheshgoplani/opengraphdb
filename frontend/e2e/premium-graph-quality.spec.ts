/**
 * SLICE 10 — premium graph quality gates.
 *
 * Four strict visual gates targeting the premium look the user asked for
 * after slice 9 shipped an all-yellow, clumped, edgeless, labelless canvas:
 *
 *   1. canvas-has-edges         — ≥20 "edge-family" pixels (cool desaturated
 *                                 blue-gray) outside of node blobs.
 *   2. canvas-has-labels        — ≥5 visible DOM `.cosmos-label` spans
 *                                 positioned over the canvas.
 *   3. canvas-density-spread    — center 200×200 crop ≥20% non-bg AND a
 *                                 corner 200×200 crop ≥5% non-bg. Forces the
 *                                 simulation to spread nodes across the space.
 *   4. canvas-color-variety     — among 30 sampled non-bg pixels, ≥5 distinct
 *                                 quantized RGB buckets (simple 4-bit-per-channel
 *                                 bucketing), proving label-color variety.
 *
 * Targets /playground?dataset=community — the synthetic 4-cluster × 80-node
 * fixture with 4 node labels + 4 intra-cluster edge types + bridge edges.
 */

import { expect, test } from '@playwright/test'
import { PNG } from 'pngjs'

interface Box {
  x: number
  y: number
  width: number
  height: number
}

function darkestCornerRgb(img: PNG): [number, number, number] {
  const w = img.width
  const h = img.height
  const idxs = [
    0,
    (w - 1) * 4,
    (h - 1) * w * 4,
    ((h - 1) * w + (w - 1)) * 4,
  ]
  let best: [number, number, number] = [255, 255, 255]
  let bestSum = 255 * 3
  for (const i of idxs) {
    const r = img.data[i]
    const g = img.data[i + 1]
    const b = img.data[i + 2]
    const s = r + g + b
    if (s < bestSum) {
      bestSum = s
      best = [r, g, b]
    }
  }
  return best
}

function nonBgFraction(img: PNG, threshold = 40): number {
  const [br, bg, bb] = darkestCornerRgb(img)
  let nonBg = 0
  let total = 0
  for (let i = 0; i < img.data.length; i += 4) {
    const dr = img.data[i] - br
    const dg = img.data[i + 1] - bg
    const db = img.data[i + 2] - bb
    if (dr * dr + dg * dg + db * db > threshold * threshold) nonBg += 1
    total += 1
  }
  return total === 0 ? 0 : nonBg / total
}

async function clipOf(page: import('@playwright/test').Page, box: Box): Promise<PNG> {
  const buf = await page.screenshot({ clip: box, type: 'png' })
  return PNG.sync.read(buf)
}

async function gotoPlayground(page: import('@playwright/test').Page): Promise<Box> {
  await page.goto('/playground?dataset=community')
  const canvas = page.locator('canvas').first()
  await canvas.waitFor({ state: 'attached', timeout: 6_000 })
  // Let the force simulation run so nodes spread out.
  await page.waitForTimeout(4_000)
  const box = await canvas.boundingBox()
  if (!box) throw new Error('canvas has no bounding box')
  return box
}

test.describe('slice 10 — premium graph quality', () => {
  test('canvas-has-edges: ≥20 edge-family pixels in the OUTER ring', async ({ page }) => {
    const box = await gotoPlayground(page)
    const img = await clipOf(page, {
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
    })

    // Edges that matter are the ones you can SEE reaching between nodes — so
    // count edge-family pixels inside an annulus around the canvas center.
    // On a clumped render, the annulus is dark background. On a spread render
    // with visible edges, the annulus contains connecting lines.
    const cx = img.width / 2
    const cy = img.height / 2
    const INNER = 180
    const OUTER = 420

    let edgeFamily = 0
    for (let y = 0; y < img.height; y += 1) {
      const dy = y - cy
      for (let x = 0; x < img.width; x += 1) {
        const dx = x - cx
        const d2 = dx * dx + dy * dy
        if (d2 < INNER * INNER || d2 > OUTER * OUTER) continue
        const i = (y * img.width + x) * 4
        const r = img.data[i]
        const g = img.data[i + 1]
        const b = img.data[i + 2]
        const brightness = r + g + b
        if (brightness < 90) continue
        if (b <= r + 25) continue // not blue-dominant
        if (b - r > 200) continue // pure saturated palette node
        if (g > b) continue
        if (Math.abs(g - b) > 110) continue
        edgeFamily += 1
      }
    }

    expect(edgeFamily, 'edge-family pixel count in outer ring').toBeGreaterThanOrEqual(20)
  })

  test('canvas-has-labels: ≥5 visible .cosmos-label spans over canvas', async ({ page }) => {
    const box = await gotoPlayground(page)
    const labels = page.locator('.cosmos-label')
    const visible = await labels.evaluateAll((els, canvasBox: Box) => {
      let count = 0
      for (const el of els) {
        const rect = (el as HTMLElement).getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue
        // Inside the canvas bounding box (with a small margin for labels that
        // extend slightly below a point).
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        if (
          cx >= canvasBox.x - 8 &&
          cx <= canvasBox.x + canvasBox.width + 8 &&
          cy >= canvasBox.y - 8 &&
          cy <= canvasBox.y + canvasBox.height + 40
        ) {
          count += 1
        }
      }
      return count
    }, box)

    expect(visible, 'visible-label count over canvas').toBeGreaterThanOrEqual(5)
  })

  test('canvas-density-spread: center ≥20% non-bg AND corner ≥5% non-bg', async ({ page }) => {
    const box = await gotoPlayground(page)
    const CROP = 200
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2

    const centerClip: Box = {
      x: Math.max(0, Math.round(cx - CROP / 2)),
      y: Math.max(0, Math.round(cy - CROP / 2)),
      width: CROP,
      height: CROP,
    }
    const centerImg = await clipOf(page, centerClip)
    const centerFrac = nonBgFraction(centerImg)
    expect(centerFrac, 'center 200×200 non-bg fraction').toBeGreaterThanOrEqual(0.2)

    // Corner crop inset 110px from NE corner so it doesn't clip past the
    // canvas edge or hit UI overlays that sit at the very edge.
    const cornerClip: Box = {
      x: Math.max(0, Math.round(box.x + box.width - CROP - 110)),
      y: Math.max(0, Math.round(box.y + 110)),
      width: CROP,
      height: CROP,
    }
    const cornerImg = await clipOf(page, cornerClip)
    const cornerFrac = nonBgFraction(cornerImg)
    expect(cornerFrac, 'corner 200×200 non-bg fraction').toBeGreaterThanOrEqual(0.05)
  })

  test('canvas-color-variety: ≥5 distinct buckets across ≥5 grid cells', async ({ page }) => {
    const box = await gotoPlayground(page)
    const img = await clipOf(page, {
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
    })

    const [br, bg, bb] = darkestCornerRgb(img)

    // Partition the canvas into a 6×4 grid and, for each cell, record the
    // most saturated non-bg pixel seen. A clumped render has ≤1 non-empty
    // cell. A proper spread has ≥10. We require ≥5 non-empty cells AND ≥5
    // distinct color buckets across them — both conditions together prove
    // the canvas has both spread and color variety.
    const GX = 6
    const GY = 4
    const cellW = Math.floor(img.width / GX)
    const cellH = Math.floor(img.height / GY)
    const cellColor = new Map<number, [number, number, number]>()

    const isNonBg = (r: number, g: number, b: number) => {
      const dr = r - br
      const dg = g - bg
      const db = b - bb
      return dr * dr + dg * dg + db * db > 60 * 60
    }

    for (let gy = 0; gy < GY; gy += 1) {
      for (let gx = 0; gx < GX; gx += 1) {
        // Sample a stride-3 scan of the cell and pick the pixel with highest
        // saturation (|max - min| across channels). Saturated pixels are
        // almost always node interior, which is what we want for variety.
        let bestSat = 0
        let bestRgb: [number, number, number] | null = null
        for (let y = gy * cellH; y < (gy + 1) * cellH; y += 3) {
          for (let x = gx * cellW; x < (gx + 1) * cellW; x += 3) {
            const i = (y * img.width + x) * 4
            const r = img.data[i]
            const g = img.data[i + 1]
            const b = img.data[i + 2]
            if (!isNonBg(r, g, b)) continue
            const maxC = Math.max(r, g, b)
            const minC = Math.min(r, g, b)
            const sat = maxC - minC
            if (sat > bestSat) {
              bestSat = sat
              bestRgb = [r, g, b]
            }
          }
        }
        if (bestRgb) cellColor.set(gy * GX + gx, bestRgb)
      }
    }

    expect(cellColor.size, 'non-empty grid cells').toBeGreaterThanOrEqual(5)

    const buckets = new Set<number>()
    for (const [r, g, b] of cellColor.values()) {
      const bucket = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
      buckets.add(bucket)
    }
    expect(buckets.size, 'distinct color buckets across cells').toBeGreaterThanOrEqual(5)
  })
})
