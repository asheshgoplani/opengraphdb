import { expect, test } from '@playwright/test'

interface LabelBound {
  x: number
  y: number
  w: number
  h: number
  id: string | number
}

declare global {
  interface Window {
    __smallObsidianLabelBounds?: () => LabelBound[]
  }
}

function rectsOverlap(a: LabelBound, b: LabelBound): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

test.describe('Landing illustrative graph polish', () => {
  test('SampleQueryPanel: 6-node graph renders, no label overlaps, no blue-dominant nodes', async ({ page }) => {
    await page.goto('/')
    // Scroll the demo section into view so the graph mounts.
    await page.locator('#demo').scrollIntoViewIfNeeded()

    // Poll for labels rather than wait a fixed 8s — the SampleQueryPanel's
    // typing loop + force-graph cooldown is sensitive to CI frame-rate /
    // IntersectionObserver timing. The fixed wait was deterministic-fail in
    // GitHub-runner chromium even when the same code rendered fine locally.
    let bounds: LabelBound[] = []
    const deadline = Date.now() + 25_000
    while (Date.now() < deadline) {
      bounds = await page.evaluate(() => window.__smallObsidianLabelBounds?.() ?? [])
      if (bounds.length >= 3) break
      await page.waitForTimeout(250)
    }
    // 6 nodes — expect at least 3 visible labels after collision pass.
    expect(bounds.length).toBeGreaterThanOrEqual(3)

    for (let i = 0; i < bounds.length; i += 1) {
      for (let j = i + 1; j < bounds.length; j += 1) {
        expect(rectsOverlap(bounds[i], bounds[j])).toBe(false)
      }
    }

    // The illustrative panel canvas should be visible.
    const canvases = await page.locator('#demo canvas').count()
    expect(canvases).toBeGreaterThan(0)
  })

  test('SampleQueryPanel: warm-tinted (amber) pixels dominate over cool-tinted (blue) pixels', async ({ page }) => {
    await page.goto('/')
    await page.locator('#demo').scrollIntoViewIfNeeded()
    await page.waitForTimeout(8000)
    // Count saturated pixels by tint family. Old palette had bright blues
    // (#7AA2FF, #22D3EE, #8B5CF6) — those would dominate cool. New AMBER
    // palette renders mostly warm (yellow/orange) saturated pixels.
    const result = await page.evaluate(() => {
      const canvas = document.querySelector('#demo canvas') as HTMLCanvasElement | null
      if (!canvas) return null
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      const w = canvas.width
      const h = canvas.height
      const data = ctx.getImageData(0, 0, w, h).data
      let warm = 0
      let cool = 0
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3]
        if (a < 64) continue
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        if (max - min < 40) continue // near-grey, skip
        // Warm: red > blue AND red+green dominate (amber/orange/yellow)
        if (r > b + 30 && r + g > b * 2) warm += 1
        // Cool: blue > red noticeably (sky/indigo/cyan)
        else if (b > r + 30) cool += 1
      }
      return { warm, cool }
    })
    expect(result).not.toBeNull()
    // Warm pixels should dominate; allow some cool pixels for label halos
    // and anti-aliasing artifacts.
    expect(result!.warm, `warm=${result!.warm} cool=${result!.cool}`).toBeGreaterThan(result!.cool)
  })
})
