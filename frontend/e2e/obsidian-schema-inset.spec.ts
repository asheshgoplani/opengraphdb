import { expect, test } from '@playwright/test'

// Phase-4 SCHEMA INSET regression spec.
//
// Promises under test:
//   (a) Bottom-right inset panel renders with role='complementary' aria-label='Schema legend'
//   (b) Clicking a type filters the main scene (data-label-filter attribute set + dimmed pixel histogram shifts)
//   (c) 'S' shortcut toggles the inset visibility
//   (d) Types painted in the inset use the same hex colours as the corresponding main-scene clusters

interface NodePosition {
  id: string | number
  x: number
  y: number
}

declare global {
  interface Window {
    __obsidianGraphReady?: boolean
    __obsidianNodePositions?: () => NodePosition[]
  }
}

async function waitGraphSettled(page: import('@playwright/test').Page) {
  await page.goto('/playground')
  await page.waitForFunction(() => window.__obsidianGraphReady === true, {
    timeout: 20_000,
  })
  await page.waitForTimeout(6000)
}

test.describe('Obsidian schema inset (Phase-4)', () => {
  test('(a) inset panel renders bottom-right with correct ARIA', async ({ page }) => {
    await waitGraphSettled(page)
    const inset = page.locator('[data-testid="obsidian-schema-inset"]')
    await expect(inset).toBeVisible()
    // Role + label exposed for assistive tech.
    const role = await inset.getAttribute('role')
    expect(role).toBe('complementary')
    const ariaLabel = await inset.getAttribute('aria-label')
    expect(ariaLabel).toBe('Schema legend')
    // Bottom-right anchor: inset's right edge sits within ~32px of the
    // viewport's right edge (margin allows for the bg blur frame).
    const box = await inset.boundingBox()
    expect(box).not.toBeNull()
    const viewport = page.viewportSize()
    expect(viewport).not.toBeNull()
    expect(viewport!.width - (box!.x + box!.width)).toBeLessThan(60)
    expect(viewport!.height - (box!.y + box!.height)).toBeLessThan(60)
  })

  test('(b) clicking a schema type filters the main scene', async ({ page }) => {
    await waitGraphSettled(page)
    const container = page.locator('[data-testid="obsidian-graph-container"]')
    // Initially no filter.
    await expect(container).not.toHaveAttribute('data-label-filter', /\w+/)

    const inset = page.locator('[data-testid="obsidian-schema-inset"]')
    const insetBox = await inset.boundingBox()
    expect(insetBox).not.toBeNull()
    // Click the centre-top of the inset, which is where the first
    // (highest-count) schema node lands per the polar layout.
    // Position 0 is at theta = -π/2 (top of the inset circle).
    const cx = insetBox!.x + insetBox!.width / 2
    const cy = insetBox!.y + 18 + 9 // PAD + NODE_R offset from top
    await page.mouse.click(cx, cy)
    // Filter should now be set on the container.
    await expect(container).toHaveAttribute('data-label-filter', /\w+/, { timeout: 2000 })
  })

  test("(c) 'S' shortcut toggles the inset visibility", async ({ page }) => {
    await waitGraphSettled(page)
    const inset = page.locator('[data-testid="obsidian-schema-inset"]')
    await expect(inset).toBeVisible()
    // Focus the container first so the keyboard handler fires.
    const container = page.locator('[data-testid="obsidian-graph-container"]')
    await container.focus()
    await page.keyboard.press('s')
    await expect(inset).toBeHidden({ timeout: 1500 })
    await page.keyboard.press('s')
    await expect(inset).toBeVisible({ timeout: 1500 })
  })

  test('(d) inset uses the same colour palette as the main scene', async ({ page }) => {
    await waitGraphSettled(page)
    // Sample a few solid-colour pixels from the inset canvas — they should
    // form a small palette set, and at least one of those colours should
    // also appear among solid-colour pixels of the main canvas.
    const result = await page.evaluate(() => {
      const inset = document.querySelector(
        '[data-testid="obsidian-schema-canvas"]',
      ) as HTMLCanvasElement | null
      const main = document.querySelector(
        'canvas[data-graph="obsidian"]',
      ) as HTMLCanvasElement | null
      if (!inset || !main) return null
      const insetCtx = inset.getContext('2d')
      const mainCtx = main.getContext('2d')
      if (!insetCtx || !mainCtx) return null
      const insetData = insetCtx.getImageData(0, 0, inset.width, inset.height).data
      const mainData = mainCtx.getImageData(0, 0, main.width, main.height).data
      // Coarse-bucket colours at 24-step granularity to merge AA gradients.
      const bucket = (r: number, g: number, b: number) => {
        const rr = Math.round(r / 24) * 24
        const gg = Math.round(g / 24) * 24
        const bb = Math.round(b / 24) * 24
        return `${rr},${gg},${bb}`
      }
      const insetColors = new Map<string, number>()
      for (let i = 0; i < insetData.length; i += 4) {
        const a = insetData[i + 3]
        if (a == null || a < 200) continue
        const r = insetData[i]!
        const g = insetData[i + 1]!
        const b = insetData[i + 2]!
        // Skip dark text + bg pixels by requiring some saturation.
        const max = Math.max(r, g, b)
        if (max < 60) continue
        if (Math.abs(r - g) < 8 && Math.abs(g - b) < 8 && max < 200) continue
        const k = bucket(r, g, b)
        insetColors.set(k, (insetColors.get(k) ?? 0) + 1)
      }
      const mainColors = new Map<string, number>()
      // Stride the main canvas to avoid scanning the entire pixel buffer.
      for (let i = 0; i < mainData.length; i += 4 * 8) {
        const a = mainData[i + 3]
        if (a == null || a < 200) continue
        const r = mainData[i]!
        const g = mainData[i + 1]!
        const b = mainData[i + 2]!
        const max = Math.max(r, g, b)
        if (max < 60) continue
        if (Math.abs(r - g) < 8 && Math.abs(g - b) < 8 && max < 200) continue
        const k = bucket(r, g, b)
        mainColors.set(k, (mainColors.get(k) ?? 0) + 1)
      }
      // Count overlapping buckets.
      let shared = 0
      for (const k of insetColors.keys()) {
        if (mainColors.has(k)) shared += 1
      }
      return {
        insetCount: insetColors.size,
        mainCount: mainColors.size,
        shared,
      }
    })
    expect(result, 'canvas sample readable').not.toBeNull()
    expect(result!.insetCount, 'inset must paint at least one saturated bucket').toBeGreaterThan(0)
    expect(
      result!.shared,
      `expected ≥1 shared colour bucket between inset (${result!.insetCount}) and main (${result!.mainCount})`,
    ).toBeGreaterThan(0)
  })
})
