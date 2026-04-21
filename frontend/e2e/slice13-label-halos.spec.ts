/**
 * Slice-13 gate: Inter 12/500 label halos with 3px navy halo, strict
 * IoU collision < 0.05, and ≥ 20 labels visible at zoom 1× on the
 * community dataset.
 */

import { expect, test } from '@playwright/test'

async function waitForGraph(page: import('@playwright/test').Page) {
  const canvas = page.locator('canvas').first()
  await canvas.waitFor({ state: 'attached', timeout: 10_000 })
  // Cosmos paints in three staggered fits (600 ms, 1500 ms, 2600 ms) before
  // the overlay locks to the final bbox. Wait past the last one.
  await page.waitForTimeout(5_500)
}

function rectIoU(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): number {
  const ax2 = a.x + a.width
  const ay2 = a.y + a.height
  const bx2 = b.x + b.width
  const by2 = b.y + b.height
  const ix1 = Math.max(a.x, b.x)
  const iy1 = Math.max(a.y, b.y)
  const ix2 = Math.min(ax2, bx2)
  const iy2 = Math.min(ay2, by2)
  const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1)
  if (inter === 0) return 0
  const aArea = a.width * a.height
  const bArea = b.width * b.height
  const union = aArea + bArea - inter
  return union === 0 ? 0 : inter / union
}

test('slice13 — label CSS is Inter 500 with 3px navy halo', async ({ page }) => {
  await page.goto('/playground?dataset=community')
  await waitForGraph(page)

  const labels = page.locator('.cosmos-label')
  const count = await labels.count()
  expect(count).toBeGreaterThanOrEqual(20)

  const first = labels.first()
  const fontFamily = await first.evaluate((el) => getComputedStyle(el).fontFamily)
  const fontWeight = await first.evaluate((el) => getComputedStyle(el).fontWeight)
  const fontSize = await first.evaluate((el) => getComputedStyle(el).fontSize)
  const textShadow = await first.evaluate((el) => getComputedStyle(el).textShadow)

  console.log(
    `[slice13-label-halos] first-label computed → family=${fontFamily}, weight=${fontWeight}, size=${fontSize}, shadow=${textShadow}`,
  )

  expect(fontFamily.toLowerCase()).toContain('inter')
  // Non-emphasized labels are 500; emphasized may be 600. Either is OK.
  expect(['500', '600']).toContain(fontWeight)
  // Label font-size: 12px (non-emphasized) or 14px (emphasized).
  expect(['12px', '14px']).toContain(fontSize)
  // Halo: 3px primary blur + navy tint.
  expect(textShadow).toContain('3px')
  // getComputedStyle normalises rgba(10, 14, 28, 0.85) to
  // `rgba(10, 14, 28, 0.85)` (with spaces). Check for the 10,14,28 navy.
  expect(textShadow.replace(/\s/g, '')).toMatch(/rgba\(10,14,28,/)
})

test('slice13 — no two labels overlap (IoU < 0.05) on community @ zoom 1×', async ({ page }) => {
  await page.goto('/playground?dataset=community')
  await waitForGraph(page)

  const labels = page.locator('.cosmos-label')
  const count = await labels.count()
  expect(count).toBeGreaterThanOrEqual(20)

  const boxes: Array<{ x: number; y: number; width: number; height: number }> = []
  for (let i = 0; i < count; i += 1) {
    const box = await labels.nth(i).boundingBox()
    if (!box) continue
    if (box.width < 4 || box.height < 4) continue
    boxes.push(box)
  }

  console.log(`[slice13-label-halos] measured label bounding boxes = ${boxes.length}`)

  let maxIoU = 0
  let maxPair: [number, number] = [-1, -1]
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const iou = rectIoU(boxes[i], boxes[j])
      if (iou > maxIoU) {
        maxIoU = iou
        maxPair = [i, j]
      }
    }
  }
  console.log(
    `[slice13-label-halos] max pairwise IoU = ${maxIoU.toFixed(4)} (labels #${maxPair[0]}, #${maxPair[1]})`,
  )
  expect(maxIoU).toBeLessThan(0.05)
})
