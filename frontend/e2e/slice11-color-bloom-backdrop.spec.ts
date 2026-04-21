/**
 * SLICE 11 — per-label palette + node bloom + gradient/dot-grid backdrop.
 *
 * Three pixel-measurable gates addressing the iteration-2 fresh-eyes review:
 *
 *   1. palette-per-label-and-edge  — Rendered canvas pixels prove that
 *      different node labels and different edge types have distinct hues.
 *      ≥3 pairwise hue deltas >30° across 4 node samples AND ≥3 across
 *      edge-family samples; saturation of sampled node pixels >0.35.
 *
 *   2. node-bloom-ring             — Pixels in a ring 8-14px outside a
 *      visible node's core are NOT background, proving bloom/glow exists.
 *      The ring's dominant hue must be within 15° of the node's core hue,
 *      so the bloom is tinted by label palette (not a generic white halo).
 *
 *   3. backdrop-vertical-gradient  — Sampling a 50×50 block near the top of
 *      the canvas and a 50×50 block near the bottom and converting each to
 *      YCbCr luma, the |top - bottom| Y delta is ≥ 10. Proves there is an
 *      actual gradient backdrop, not a flat navy fill.
 *
 * These gates target /playground?dataset=community — a 4-cluster × 60-node
 * fixture with 4 node labels (Person / Character / City / Company) + 4
 * intra-cluster edge types + 4 bridge edge types (8 edge types total).
 */

import { expect, test } from '@playwright/test'
import { PNG } from 'pngjs'

interface Box {
  x: number
  y: number
  width: number
  height: number
}

type Rgb = [number, number, number]
type Hsl = [number, number, number]

function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0)
        break
      case gn:
        h = (bn - rn) / d + 2
        break
      case bn:
        h = (rn - gn) / d + 4
        break
    }
    h = h * 60
  }
  return [h, s, l]
}

function hueDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

function lumaY(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

async function clipOf(page: import('@playwright/test').Page, box: Box): Promise<PNG> {
  const buf = await page.screenshot({ clip: box, type: 'png' })
  return PNG.sync.read(buf)
}

async function gotoPlayground(page: import('@playwright/test').Page): Promise<Box> {
  await page.goto('/playground?dataset=community')
  const canvas = page.locator('canvas').first()
  await canvas.waitFor({ state: 'attached', timeout: 6_000 })
  // Let the force simulation run so nodes spread out and the UI settles.
  await page.waitForTimeout(4_000)
  const box = await canvas.boundingBox()
  if (!box) throw new Error('canvas has no bounding box')
  return box
}

interface LabelPos {
  x: number
  y: number
  text: string
}

async function cosmosLabelPositions(
  page: import('@playwright/test').Page
): Promise<LabelPos[]> {
  return await page.locator('.cosmos-label').evaluateAll((els) =>
    els
      .map((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect()
        return {
          x: rect.left + rect.width / 2,
          y: rect.top,
          text: (el.textContent ?? '').trim(),
        }
      })
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  )
}

// Sample the dominant (most saturated) pixel in a small square region of the
// PNG centered at (cx, cy). Returns null if no sufficiently-saturated pixel
// exists (i.e. we sampled only background).
function dominantPixel(
  img: PNG,
  cx: number,
  cy: number,
  half: number,
  minSat = 0.2
): Rgb | null {
  let bestSat = 0
  let best: Rgb | null = null
  for (let y = Math.max(0, cy - half); y < Math.min(img.height, cy + half); y += 1) {
    for (let x = Math.max(0, cx - half); x < Math.min(img.width, cx + half); x += 1) {
      const i = (y * img.width + x) * 4
      const r = img.data[i]
      const g = img.data[i + 1]
      const b = img.data[i + 2]
      const maxC = Math.max(r, g, b)
      const minC = Math.min(r, g, b)
      const sat = (maxC - minC) / 255
      if (sat > bestSat && sat >= minSat) {
        bestSat = sat
        best = [r, g, b]
      }
    }
  }
  return best
}

function distinctHueCount(hues: number[], threshold = 30): number {
  // Count how many pairs have delta > threshold, return the number of
  // hues that are "sufficiently distinct" from the first. Simpler metric:
  // count pairs, which is what the spec says.
  let pairs = 0
  for (let i = 0; i < hues.length; i += 1) {
    for (let j = i + 1; j < hues.length; j += 1) {
      if (hueDelta(hues[i], hues[j]) > threshold) pairs += 1
    }
  }
  return pairs
}

test.describe('slice 11 — palette, bloom, backdrop', () => {
  test('palette-per-label-and-edge: hue variety across labels + edges', async ({
    page,
  }) => {
    const box = await gotoPlayground(page)
    const positions = await cosmosLabelPositions(page)
    expect(positions.length, 'cosmos labels on canvas').toBeGreaterThan(0)

    const canvasImg = await clipOf(page, {
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
    })

    // Group label DOM positions by text-first-word heuristic. Community
    // dataset seeds names like "Ada 1", "Frodo 1", "Kyoto 1", "Helix 1" —
    // the seed roots cluster by label because each cluster has unique
    // seed names. Sample one node per group.
    const seedToLabel: Record<string, string> = {
      Ada: 'Person', Alan: 'Person', Grace: 'Person', Linus: 'Person',
      Margaret: 'Person', Dennis: 'Person', Barbara: 'Person', Guido: 'Person',
      Arwen: 'Character', Frodo: 'Character', Aragorn: 'Character', Legolas: 'Character',
      Gimli: 'Character', Gandalf: 'Character', Boromir: 'Character', Sam: 'Character',
      Kyoto: 'City', Reykjavik: 'City', Porto: 'City', Prague: 'City',
      Quito: 'City', Lima: 'City', Oslo: 'City', Dakar: 'City',
      Helix: 'Company', Nimbus: 'Company', Tesseract: 'Company', Lumen: 'Company',
      Quill: 'Company', Aster: 'Company', Borealis: 'Company', Vireo: 'Company',
    }

    const byLabel = new Map<string, LabelPos[]>()
    for (const p of positions) {
      const seed = p.text.split(' ')[0]
      const label = seedToLabel[seed]
      if (!label) continue
      if (!byLabel.has(label)) byLabel.set(label, [])
      byLabel.get(label)!.push(p)
    }

    // Need all 4 label groups present to run the per-label sample.
    expect(byLabel.size, 'distinct label groups with labels on canvas').toBeGreaterThanOrEqual(4)

    const nodeHues: number[] = []
    const nodeSats: number[] = []
    const nodeLabelHue = new Map<string, number>()

    for (const [label, group] of byLabel) {
      for (const p of group) {
        // Node center sits ~r+6 px ABOVE the label top (see CosmosCanvas
        // label layout). Sample a 6×6 box just above the label.
        const sx = Math.round(p.x - box.x)
        const sy = Math.round(p.y - box.y - 10)
        if (sx < 0 || sy < 0 || sx >= canvasImg.width || sy >= canvasImg.height) continue
        const rgb = dominantPixel(canvasImg, sx, sy, 6, 0.25)
        if (!rgb) continue
        const [h, s] = rgbToHsl(rgb[0], rgb[1], rgb[2])
        nodeHues.push(h)
        nodeSats.push(s)
        if (!nodeLabelHue.has(label)) nodeLabelHue.set(label, h)
        break // one representative per label group is enough
      }
    }

    expect(nodeHues.length, 'distinct label-group node samples').toBeGreaterThanOrEqual(4)

    const maxSat = Math.max(...nodeSats)
    expect(maxSat, 'max saturation across sampled node pixels').toBeGreaterThan(0.35)

    const nodePairs = distinctHueCount(nodeHues, 30)
    expect(nodePairs, 'node hue-pairs with >30° delta').toBeGreaterThanOrEqual(3)

    // Edge-color variety: scan a dense grid of pixels across the canvas and
    // pick "edge-like" pixels (saturated-but-not-the-brightest — bright
    // peaks are node cores, not edge pixels). Then count distinct hue
    // buckets, each 20° wide.
    const edgeHues: number[] = []
    const W = canvasImg.width
    const H = canvasImg.height
    for (let y = 20; y < H - 20; y += 6) {
      for (let x = 20; x < W - 20; x += 6) {
        const i = (y * W + x) * 4
        const r = canvasImg.data[i]
        const g = canvasImg.data[i + 1]
        const b = canvasImg.data[i + 2]
        const maxC = Math.max(r, g, b)
        const minC = Math.min(r, g, b)
        const sat = (maxC - minC) / 255
        const bright = maxC / 255
        // Edge pixel heuristic: saturation between 0.18 and 0.8, and not
        // the absolute peak of a node core (bright < 0.95). Also not bg
        // (bright > 0.12).
        if (sat < 0.18 || sat > 0.85) continue
        if (bright < 0.2 || bright > 0.95) continue
        const [h] = rgbToHsl(r, g, b)
        edgeHues.push(h)
      }
    }

    // Bucket edge hues into 20° bins and count distinct ones with ≥3 hits.
    const buckets = new Map<number, number>()
    for (const h of edgeHues) {
      const b = Math.floor(h / 20) % 18
      buckets.set(b, (buckets.get(b) ?? 0) + 1)
    }
    const populated = Array.from(buckets.entries())
      .filter(([, n]) => n >= 3)
      .map(([b]) => b * 20 + 10) // bucket center hue

    expect(populated.length, 'distinct edge hue buckets (>=3 hits each)').toBeGreaterThanOrEqual(4)

    const edgePairs = distinctHueCount(populated, 30)
    expect(edgePairs, 'edge hue-pairs with >30° delta').toBeGreaterThanOrEqual(3)
  })

  test('node-bloom-ring: hub has colored glow outside its core', async ({ page }) => {
    const box = await gotoPlayground(page)
    const positions = await cosmosLabelPositions(page)
    expect(positions.length, 'cosmos labels on canvas').toBeGreaterThan(0)

    const canvasImg = await clipOf(page, {
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
    })

    // Background reference = darkest of the four canvas corners.
    const corners: Array<[number, number]> = [
      [5, 5],
      [canvasImg.width - 6, 5],
      [5, canvasImg.height - 6],
      [canvasImg.width - 6, canvasImg.height - 6],
    ]
    let bgR = 255,
      bgG = 255,
      bgB = 255
    let bgSum = 255 * 3
    for (const [cx, cy] of corners) {
      const i = (cy * canvasImg.width + cx) * 4
      const sum = canvasImg.data[i] + canvasImg.data[i + 1] + canvasImg.data[i + 2]
      if (sum < bgSum) {
        bgSum = sum
        bgR = canvasImg.data[i]
        bgG = canvasImg.data[i + 1]
        bgB = canvasImg.data[i + 2]
      }
    }

    // Find nodes with a well-defined core: dominant pixel above the label
    // has saturation > 0.35. Test ≥1 such node for a colored glow ring.
    const tested: Array<{ label: string; coreHue: number; ringHue: number; ringBrightDelta: number }> = []
    for (const p of positions) {
      const sx = Math.round(p.x - box.x)
      const syCore = Math.round(p.y - box.y - 10)
      if (sx < 8 || syCore < 14 || sx >= canvasImg.width - 8 || syCore >= canvasImg.height - 14) continue
      const coreRgb = dominantPixel(canvasImg, sx, syCore, 3, 0.3)
      if (!coreRgb) continue
      const [coreH] = rgbToHsl(coreRgb[0], coreRgb[1], coreRgb[2])

      // Sample a RING outside the core (radius 9-14 px). The core is a
      // ~6-8px disc, so pixels at 9-14px should be the bloom. Collect all
      // non-background pixels in that annulus and find the dominant hue.
      const hues: number[] = []
      let ringNonBgCount = 0
      let ringBrightSum = 0
      let ringSampleCount = 0
      for (let dy = -14; dy <= 14; dy += 1) {
        for (let dx = -14; dx <= 14; dx += 1) {
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < 9 || d > 14) continue
          const x = sx + dx
          const y = syCore + dy
          if (x < 0 || y < 0 || x >= canvasImg.width || y >= canvasImg.height) continue
          const idx = (y * canvasImg.width + x) * 4
          const r = canvasImg.data[idx]
          const g = canvasImg.data[idx + 1]
          const b = canvasImg.data[idx + 2]
          const dr = r - bgR
          const dg = g - bgG
          const db = b - bgB
          ringSampleCount += 1
          ringBrightSum += r + g + b
          if (dr * dr + dg * dg + db * db > 20 * 20) {
            ringNonBgCount += 1
            const [h, s] = rgbToHsl(r, g, b)
            if (s > 0.1) hues.push(h)
          }
        }
      }
      if (ringSampleCount === 0 || hues.length < 5) continue

      // Pick dominant hue — use bucket-mode (20° bins) to be robust.
      const ringBuckets = new Map<number, number>()
      for (const h of hues) {
        const bk = Math.floor(h / 20) % 18
        ringBuckets.set(bk, (ringBuckets.get(bk) ?? 0) + 1)
      }
      let bestBucket = 0
      let bestCount = 0
      for (const [bk, n] of ringBuckets) {
        if (n > bestCount) {
          bestCount = n
          bestBucket = bk
        }
      }
      const ringHue = bestBucket * 20 + 10
      const ringBrightDelta = ringBrightSum / ringSampleCount - (bgR + bgG + bgB)

      tested.push({
        label: p.text,
        coreHue: coreH,
        ringHue,
        ringBrightDelta,
      })
      if (tested.length >= 15) break
    }

    expect(tested.length, 'nodes with a well-defined core fit for glow sampling').toBeGreaterThanOrEqual(3)

    // At least one tested node must show a glow: non-bg ring pixels brighter
    // than bg on average by a clear margin.
    const brightRingCount = tested.filter((t) => t.ringBrightDelta > 18).length
    expect(
      brightRingCount,
      `nodes with bloom-ring brightness Δ>18 (tested=${tested.map((t) => `${t.label.slice(0, 8)}:${t.ringBrightDelta.toFixed(0)}`).join(',')})`
    ).toBeGreaterThanOrEqual(1)

    // And for the nodes where the ring has a clear non-bg presence, the
    // ring hue should match the core hue within 15° for ≥1 sample (per
    // spec: the bloom is tinted by the label's palette).
    const hueMatched = tested.filter((t) => hueDelta(t.coreHue, t.ringHue) < 15)
    expect(
      hueMatched.length,
      `nodes where ring-hue ≈ core-hue within 15° (samples=${tested.map((t) => `${t.label.slice(0, 8)}:core=${t.coreHue.toFixed(0)}/ring=${t.ringHue}`).join(',')})`
    ).toBeGreaterThanOrEqual(1)
  })

  test('backdrop-vertical-gradient: top-bottom luma delta ≥ 10', async ({ page }) => {
    const box = await gotoPlayground(page)

    const TOP_Y = Math.round(box.y + 40)
    const BOTTOM_Y = Math.round(box.y + box.height - 90)
    const BLOCK_SIZE = 50
    const CENTER_X = Math.round(box.x + box.width / 2 - BLOCK_SIZE / 2)

    const topImg = await clipOf(page, {
      x: CENTER_X,
      y: TOP_Y,
      width: BLOCK_SIZE,
      height: BLOCK_SIZE,
    })
    const botImg = await clipOf(page, {
      x: CENTER_X,
      y: BOTTOM_Y,
      width: BLOCK_SIZE,
      height: BLOCK_SIZE,
    })

    // Average luma across each block. This average stays stable even with
    // a few bright node pixels inside because most pixels are background.
    function avgLuma(img: PNG): number {
      let sum = 0
      let count = 0
      for (let i = 0; i < img.data.length; i += 4) {
        sum += lumaY(img.data[i], img.data[i + 1], img.data[i + 2])
        count += 1
      }
      return count === 0 ? 0 : sum / count
    }

    const topY = avgLuma(topImg)
    const botY = avgLuma(botImg)
    const delta = Math.abs(topY - botY)
    expect(
      delta,
      `top-Y(${topY.toFixed(2)}) vs bottom-Y(${botY.toFixed(2)}) luma delta`
    ).toBeGreaterThanOrEqual(10)
  })
})
