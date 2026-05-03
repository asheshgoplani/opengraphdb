// COV-H14 — Graph canvas pan + scroll-zoom (user-input).
//
// COVERAGE-AUDIT.md gap H14 (P18, P19):
//   "Graph canvas pan (drag) + scroll-zoom (user-input, not programmatic)
//    untested. POLISH#4 is programmatic zoom-clamp; user wheel input not
//    exercised."
//
// Existing graph specs cover hover/select/2-hop fade and a programmatic
// zoom-clamp probe (obsidian-graph-quality POLISH #4 wheel-out is asserted
// only as "did the harness still work after extreme wheel-out", not as
// "did a single user wheel event move the camera"). Pan is entirely
// uncovered.
//
// Contracts pinned here (using user input, NOT internal force-graph APIs):
//   1. Mouse-wheel zoom IN changes `__obsidianCameraScale()` upward.
//   2. Mouse-wheel zoom OUT changes `__obsidianCameraScale()` downward.
//   3. A click-drag of the canvas background pans the camera — proven by
//      the on-screen position of a fixed world-space point shifting.
//
// Pan is the trickier of the two: ObsidianGraph world coordinates are
// not affected by a pan (positions stay in world space), but the
// world→screen transform does change. We sample the screen position of
// node[0] before and after the drag via the `__obsidianGraphToScreen`
// harness — its delta must approximately match the drag delta, with
// healthy tolerance for camera momentum and rounding.

import { expect, test, type Page } from '@playwright/test'

declare global {
  interface Window {
    __obsidianGraphReady?: boolean
    __obsidianNodePositions?: () => Array<{ id: string | number; x: number; y: number }>
    __obsidianCameraScale?: () => number | null
    __obsidianGraphToScreen?: (
      x: number,
      y: number,
    ) => { x: number; y: number } | null
  }
}

async function waitGraphSettled(page: Page) {
  await page.goto('/playground')
  await page.waitForFunction(() => window.__obsidianGraphReady === true, {
    timeout: 20_000,
  })
  // Let the entry dolly + initial drift settle so we sample a stable camera.
  await page.waitForTimeout(6000)
}

test.describe('COV-H14 — graph canvas pan + scroll-zoom (user input)', () => {
  test('mouse wheel up changes camera scale (zoom in)', async ({ page }) => {
    await waitGraphSettled(page)

    const canvas = page.locator('canvas[data-graph="obsidian"]')
    await expect(canvas).toBeVisible()
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()

    // Sample baseline camera scale.
    const before = await page.evaluate(() => window.__obsidianCameraScale?.() ?? null)
    expect(before, 'camera scale must be readable from the harness').not.toBeNull()

    // Move into the canvas, then dispatch a single wheel-up gesture.
    // react-force-graph maps positive deltaY to zoom-out; negative to
    // zoom-in (mirrors browser scroll-zoom convention).
    const cx = box!.x + box!.width / 2
    const cy = box!.y + box!.height / 2
    await page.mouse.move(cx, cy)
    for (let i = 0; i < 5; i += 1) {
      await page.mouse.wheel(0, -120)
    }
    await page.waitForTimeout(300)

    const after = await page.evaluate(() => window.__obsidianCameraScale?.() ?? null)
    expect(after, 'camera scale must be readable after wheel').not.toBeNull()
    expect(
      (after as number) - (before as number),
      `wheel-up must increase camera scale (before=${before}, after=${after})`,
    ).toBeGreaterThan(0.001)
  })

  test('mouse wheel down changes camera scale (zoom out)', async ({ page }) => {
    await waitGraphSettled(page)

    const canvas = page.locator('canvas[data-graph="obsidian"]')
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()

    const before = await page.evaluate(() => window.__obsidianCameraScale?.() ?? null)
    expect(before).not.toBeNull()

    const cx = box!.x + box!.width / 2
    const cy = box!.y + box!.height / 2
    await page.mouse.move(cx, cy)
    for (let i = 0; i < 5; i += 1) {
      await page.mouse.wheel(0, 120)
    }
    await page.waitForTimeout(300)

    const after = await page.evaluate(() => window.__obsidianCameraScale?.() ?? null)
    expect(after).not.toBeNull()
    expect(
      (before as number) - (after as number),
      `wheel-down must decrease camera scale (before=${before}, after=${after})`,
    ).toBeGreaterThan(0.001)
  })

  test('click-drag the canvas background pans the camera', async ({ page }) => {
    await waitGraphSettled(page)

    const canvas = page.locator('canvas[data-graph="obsidian"]')
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()

    // Pick a world-space anchor: node[0]. Read its screen position before
    // and after the drag — pan changes the world→screen transform but
    // leaves world coordinates untouched, so the on-screen delta must
    // shift in the drag direction.
    const anchor = await page.evaluate(() => {
      const positions = window.__obsidianNodePositions?.() ?? []
      if (positions.length === 0) return null
      return positions[0]
    })
    expect(anchor, 'graph must expose at least one positioned node').not.toBeNull()

    const screenBefore = await page.evaluate(
      ([x, y]) => window.__obsidianGraphToScreen?.(x, y) ?? null,
      [anchor!.x, anchor!.y] as const,
    )
    expect(screenBefore, 'graphToScreen must resolve before drag').not.toBeNull()

    // Drag from a non-node area near a corner (so we don't accidentally
    // pick up a node click), 200px to the right.
    const startX = box!.x + 80
    const startY = box!.y + 80
    const endX = startX + 200
    const endY = startY

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    // Multi-step move so react-force-graph's pan handler picks it up as a
    // sustained drag (single-step jumps can be debounced/ignored).
    await page.mouse.move(startX + 50, startY, { steps: 5 })
    await page.mouse.move(startX + 100, startY, { steps: 5 })
    await page.mouse.move(startX + 150, startY, { steps: 5 })
    await page.mouse.move(endX, endY, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(400)

    const screenAfter = await page.evaluate(
      ([x, y]) => window.__obsidianGraphToScreen?.(x, y) ?? null,
      [anchor!.x, anchor!.y] as const,
    )
    expect(screenAfter, 'graphToScreen must resolve after drag').not.toBeNull()

    const dx = (screenAfter!.x - screenBefore!.x)
    const dy = (screenAfter!.y - screenBefore!.y)

    // The same world point should have moved ≥ 50 px on screen — well
    // below the 200 px drag distance to leave headroom for momentum
    // damping, but well above any noise floor from the heartbeat /
    // drift simulations (~2 px/s).
    expect(
      Math.hypot(dx, dy),
      `pan must shift the screen-projection of a fixed world point ≥50px (dx=${dx.toFixed(1)}, dy=${dy.toFixed(1)})`,
    ).toBeGreaterThan(50)
  })
})
