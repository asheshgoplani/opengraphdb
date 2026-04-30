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
    __obsidianGraphReady?: boolean
    __obsidianLabelBounds?: () => LabelBound[]
    __obsidianNodePositions?: () => Array<{ id: string | number; x: number; y: number }>
  }
}

function rectsOverlap(a: LabelBound, b: LabelBound): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

test.describe('Obsidian graph polish — labels + spread', () => {
  test('default dataset: rendered labels do not overlap, and ≥6 are visible', async ({ page }) => {
    await page.goto('/playground')
    await page.waitForFunction(
      () => window.__obsidianGraphReady === true,
      { timeout: 20_000 },
    )
    // Allow d3 force simulation to settle (cooldownTicks ≈ 200, alphaDecay 0.02).
    await page.waitForTimeout(6000)

    const bounds = await page.evaluate(() => window.__obsidianLabelBounds?.() ?? [])
    expect(bounds.length).toBeGreaterThanOrEqual(6)

    const collisions: Array<[LabelBound, LabelBound]> = []
    for (let i = 0; i < bounds.length; i += 1) {
      for (let j = i + 1; j < bounds.length; j += 1) {
        if (rectsOverlap(bounds[i], bounds[j])) {
          collisions.push([bounds[i], bounds[j]])
        }
      }
    }
    expect(collisions, `expected zero label collisions, got ${collisions.length}: ${JSON.stringify(collisions.slice(0, 3))}`).toHaveLength(0)
  })

  test('default dataset: nodes spread out — no two within 18px of each other', async ({ page }) => {
    await page.goto('/playground')
    await page.waitForFunction(
      () => window.__obsidianGraphReady === true,
      { timeout: 20_000 },
    )
    await page.waitForTimeout(6000)

    const positions = await page.evaluate(
      () => window.__obsidianNodePositions?.() ?? [],
    )
    expect(positions.length).toBeGreaterThan(20)

    let tooClose = 0
    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        const dx = positions[i].x - positions[j].x
        const dy = positions[i].y - positions[j].y
        const d2 = dx * dx + dy * dy
        if (d2 < 18 * 18) tooClose += 1
      }
    }
    expect(tooClose, `nodes too close (within 18px): ${tooClose}`).toBe(0)
  })
})
