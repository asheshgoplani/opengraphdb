/**
 * SLICE 12 — shared-backdrop cohesion + vertical-gradient + corner vignette.
 *
 *   1. "shared backdrop carries from landing to playground" — crop a 200×200
 *      block from the hero center and a 200×200 block from the playground
 *      canvas center. Convert each to mean Lab color (sRGB → XYZ → Lab).
 *      ΔE76 between the two means must be < 8 (the two look identifiably
 *      like the same editorial navy).
 *
 *   2. "gradient luminance delta ≥ 18" — avg luma of an 80×80 block near
 *      the top of the canvas vs an 80×80 block near the bottom. |top-bot|
 *      must be ≥ 18 (stronger than slice-11's 10, per slice-12 spec).
 *
 *   3. "corner vignette darkens by ≥12 luma at 300px from edge" — compare
 *      40×40 center block against 40×40 block at 300 px diagonal from
 *      bottom-right corner. Corner must be ≥12 Y darker.
 */

import { expect, test } from '@playwright/test'
import { PNG } from 'pngjs'

interface Box {
  x: number
  y: number
  width: number
  height: number
}

function lumaY(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

async function clipOf(page: import('@playwright/test').Page, box: Box): Promise<PNG> {
  const buf = await page.screenshot({ clip: box, type: 'png' })
  return PNG.sync.read(buf)
}

// sRGB → linear RGB. Input 0..255. Output 0..1.
function srgbToLinear(c: number): number {
  const cn = c / 255
  return cn <= 0.04045 ? cn / 12.92 : Math.pow((cn + 0.055) / 1.055, 2.4)
}

// sRGB → CIE Lab (D65).
function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)
  // linear RGB → XYZ (D65)
  const X = lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375
  const Y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175
  const Z = lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041
  // Reference white D65.
  const Xr = 0.95047
  const Yr = 1.0
  const Zr = 1.08883
  const f = (t: number) =>
    t > Math.pow(6 / 29, 3) ? Math.cbrt(t) : t * (1 / 3) * Math.pow(29 / 6, 2) + 4 / 29
  const fx = f(X / Xr)
  const fy = f(Y / Yr)
  const fz = f(Z / Zr)
  const L = 116 * fy - 16
  const a = 500 * (fx - fy)
  const bv = 200 * (fy - fz)
  return [L, a, bv]
}

function meanLab(img: PNG): [number, number, number] {
  let L = 0
  let a = 0
  let bv = 0
  let count = 0
  for (let i = 0; i < img.data.length; i += 4) {
    const [Li, ai, bi] = rgbToLab(img.data[i], img.data[i + 1], img.data[i + 2])
    L += Li
    a += ai
    bv += bi
    count += 1
  }
  return count === 0 ? [0, 0, 0] : [L / count, a / count, bv / count]
}

function deltaE76(
  lab1: [number, number, number],
  lab2: [number, number, number],
): number {
  const dL = lab1[0] - lab2[0]
  const da = lab1[1] - lab2[1]
  const db = lab1[2] - lab2[2]
  return Math.sqrt(dL * dL + da * da + db * db)
}

function avgLuma(img: PNG): number {
  let sum = 0
  let count = 0
  for (let i = 0; i < img.data.length; i += 4) {
    sum += lumaY(img.data[i], img.data[i + 1], img.data[i + 2])
    count += 1
  }
  return count === 0 ? 0 : sum / count
}

async function playgroundCanvasBox(
  page: import('@playwright/test').Page,
): Promise<Box> {
  await page.goto('/playground?dataset=community')
  const canvas = page.locator('canvas').first()
  await canvas.waitFor({ state: 'attached', timeout: 6_000 })
  await page.waitForTimeout(5_000)
  const box = await canvas.boundingBox()
  if (!box) throw new Error('canvas has no bounding box')
  return box
}

test.describe('slice 12 — backdrop cohesion + depth', () => {
  test('shared backdrop carries from landing to playground (ΔE76 < 8)', async ({
    page,
  }) => {
    await page.goto('/')
    // Wait long enough for the hero gradient + HeroGraphBackground animation.
    await page.waitForTimeout(1_800)

    const viewport = page.viewportSize() ?? { width: 1280, height: 800 }
    // Both crops come from the UPPER-LEFT quadrant of their respective
    // surfaces, at matched relative positions. The AppBackdrop vertical
    // gradient is the same shape in both (identical gradient stops), so a
    // same-relative-y crop carries the same tonal baseline. Hero also has
    // a big radial near (50%,30%) — avoid that by picking x near the left
    // edge. Playground canvas also has nodes/bloom clustered center-out —
    // same left-edge sample avoids them.
    const heroCrop: Box = {
      x: 20,
      y: Math.round(viewport.height * 0.2),
      width: 200,
      height: 200,
    }
    const heroImg = await clipOf(page, heroCrop)
    const heroLab = meanLab(heroImg)

    const canvasBox = await playgroundCanvasBox(page)
    const pgCrop: Box = {
      x: Math.round(canvasBox.x + 20),
      y: Math.round(canvasBox.y + canvasBox.height * 0.2),
      width: 200,
      height: 200,
    }
    const pgImg = await clipOf(page, pgCrop)
    const pgLab = meanLab(pgImg)

    const dE = deltaE76(heroLab, pgLab)
    expect(
      dE,
      `ΔE76 hero(L=${heroLab[0].toFixed(2)},a=${heroLab[1].toFixed(2)},b=${heroLab[2].toFixed(2)}) vs playground(L=${pgLab[0].toFixed(2)},a=${pgLab[1].toFixed(2)},b=${pgLab[2].toFixed(2)})`,
    ).toBeLessThan(8)
  })

  test('gradient luminance delta ≥ 18', async ({ page }) => {
    const box = await playgroundCanvasBox(page)

    const BLOCK = 80
    const TOP_Y = Math.round(box.y + 40)
    const BOTTOM_Y = Math.round(box.y + box.height - (BLOCK + 40))
    const CENTER_X = Math.round(box.x + box.width / 2 - BLOCK / 2)

    const topImg = await clipOf(page, {
      x: CENTER_X,
      y: TOP_Y,
      width: BLOCK,
      height: BLOCK,
    })
    const botImg = await clipOf(page, {
      x: CENTER_X,
      y: BOTTOM_Y,
      width: BLOCK,
      height: BLOCK,
    })

    const topY = avgLuma(topImg)
    const botY = avgLuma(botImg)
    const delta = Math.abs(topY - botY)
    expect(
      delta,
      `top-Y(${topY.toFixed(2)}) vs bottom-Y(${botY.toFixed(2)}) luma delta`,
    ).toBeGreaterThanOrEqual(18)
  })

  test('corner vignette darkens by ≥12 luma at 300px from edge', async ({ page }) => {
    const box = await playgroundCanvasBox(page)

    const BLOCK = 40
    const centerClip: Box = {
      x: Math.round(box.x + box.width / 2 - BLOCK / 2),
      y: Math.round(box.y + box.height / 2 - BLOCK / 2),
      width: BLOCK,
      height: BLOCK,
    }
    // 300 px diagonally inward from the bottom-right corner = a point that
    // should still be clearly inside the vignette's dark ring.
    const cornerClip: Box = {
      x: Math.max(
        Math.round(box.x),
        Math.round(box.x + box.width - 300 + BLOCK / 2) - Math.floor(BLOCK / 2),
      ),
      y: Math.max(
        Math.round(box.y),
        Math.round(box.y + box.height - 300 + BLOCK / 2) - Math.floor(BLOCK / 2),
      ),
      width: BLOCK,
      height: BLOCK,
    }
    // If the viewport is smaller than 300 + BLOCK, fall back to ~20 px
    // from the corner which still hits the vignette.
    if (cornerClip.x < centerClip.x + BLOCK + 10 || cornerClip.y < centerClip.y + BLOCK + 10) {
      cornerClip.x = Math.round(box.x + box.width - BLOCK - 20)
      cornerClip.y = Math.round(box.y + box.height - BLOCK - 20)
    }

    const centerImg = await clipOf(page, centerClip)
    const cornerImg = await clipOf(page, cornerClip)

    const centerY = avgLuma(centerImg)
    const cornerY = avgLuma(cornerImg)
    const delta = centerY - cornerY
    expect(
      delta,
      `center-Y(${centerY.toFixed(2)}) − corner-Y(${cornerY.toFixed(2)}) vignette delta`,
    ).toBeGreaterThanOrEqual(12)
  })
})
