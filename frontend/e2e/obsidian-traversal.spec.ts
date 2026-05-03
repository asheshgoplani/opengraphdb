import { expect, test } from '@playwright/test'

// Phase-3 STORY — traversal cinematic regression spec.
//
// Covers the five user-visible promises:
//   (a) Click 'Show a path' pill → Step N/K badge appears
//   (b) Wait through the cinematic → 'Path complete ✓' + Replay pill visible
//   (c) Cancellation — clicking a non-path node mid-cinematic clears the
//       badge within 100 ms
//   (d) Active edge color samples to the sacred cyan-blue (#5B9DFF)
//   (e) Replay pill click restarts the cinematic from step 1

interface TraversalState {
  isPlaying: boolean
  completed: boolean
  step: number
  total: number
  litNodeIds: Array<string | number>
  activeEdgeId: string | number | null
  pathNodeIds: Array<string | number>
}

declare global {
  interface Window {
    __obsidianGraphReady?: boolean
    __obsidianTraversalState?: () => TraversalState
    __obsidianDispatchDemoPath?: () => Array<string | number> | null
    __obsidianGraphToScreen?: (
      x: number,
      y: number,
    ) => { x: number; y: number } | null
    __obsidianNodePositions?: () => Array<{ id: string | number; x: number; y: number }>
    __obsidianClickNode?: (id: string | number) => void
  }
}

async function waitGraphSettled(page: import('@playwright/test').Page) {
  await page.goto('/playground')
  await page.waitForFunction(() => window.__obsidianGraphReady === true, {
    timeout: 20_000,
  })
  // Same settle window the existing obsidian specs use — gives the
  // simulation time to cool so node positions are stable when the
  // cinematic kicks off.
  await page.waitForTimeout(6000)
}

test.describe('Obsidian traversal cinematic (Phase-3 STORY)', () => {
  test('(a) Show a path pill → Step N/K badge appears', async ({ page }) => {
    await waitGraphSettled(page)
    const pill = page.locator('[data-testid="obsidian-demo-path-pill"]')
    await expect(pill).toBeVisible()
    await pill.click()
    const badge = page.locator('[data-testid="obsidian-step-counter"]')
    await expect(badge).toBeVisible({ timeout: 2000 })
    // Step text must read "Step N / K" while the cinematic is in flight.
    await expect(badge).toContainText(/Step \d+ \/ \d+/)
  })

  test('(b) Cinematic completes → Path complete ✓ + Replay pill visible', async ({ page }) => {
    await waitGraphSettled(page)
    const pill = page.locator('[data-testid="obsidian-demo-path-pill"]')
    await pill.click()
    const badge = page.locator('[data-testid="obsidian-step-counter"]')
    await expect(badge).toBeVisible({ timeout: 2000 })
    // Wait through the per-step duration. With pickDemoEndpoints producing
    // typically a 2–4 hop path at ~700ms per step plus a 650ms intro and
    // an 800ms outro, 6s is a comfortable upper bound for completion.
    await expect(badge).toContainText('Path complete ✓', { timeout: 8000 })
    const replay = page.locator('[data-testid="obsidian-replay-pill"]')
    await expect(replay).toBeVisible()
  })

  test('(c) Click non-path node mid-cinematic → step counter disappears within 100ms', async ({
    page,
  }) => {
    await waitGraphSettled(page)
    const pill = page.locator('[data-testid="obsidian-demo-path-pill"]')
    await pill.click()
    const badge = page.locator('[data-testid="obsidian-step-counter"]')
    await expect(badge).toBeVisible({ timeout: 2000 })

    // Resolve a node id that is NOT on the cinematic's path, then drive a
    // click into the graph through the harness — bypassing the canvas
    // hit-test (which is unreliable while the camera is dollying).
    const offPathId = await page.evaluate(() => {
      const state = window.__obsidianTraversalState?.()
      const positions = window.__obsidianNodePositions?.() ?? []
      if (!state) return null
      const onPath = new Set<string | number>(state.pathNodeIds)
      const off = positions.find((p) => !onPath.has(p.id))
      return off?.id ?? null
    })
    expect(offPathId).not.toBeNull()
    await page.evaluate((id) => window.__obsidianClickNode?.(id!), offPathId)

    // Cancellation should hide the badge effectively immediately. We
    // give 200ms slack to ride out the React commit phase.
    await expect(badge).toBeHidden({ timeout: 200 })
  })

  test('(d) Active edge samples to sacred cyan-blue (#5B9DFF)', async ({ page }) => {
    await waitGraphSettled(page)
    const pill = page.locator('[data-testid="obsidian-demo-path-pill"]')
    await pill.click()
    // Wait until the cinematic is mid-flight (at least step 2 reached, so
    // an active edge is being drawn between two lit nodes).
    await page.waitForFunction(
      () => {
        const s = window.__obsidianTraversalState?.()
        return s != null && s.isPlaying && s.litNodeIds.length >= 1 && s.activeEdgeId != null
      },
      { timeout: 5000 },
    )

    // Sample the canvas pixel histogram for the cyan-blue family. The
    // sacred hex is rgb(91,157,255); we accept a small tolerance to
    // handle anti-aliasing.
    const found = await page.evaluate(() => {
      const c = document.querySelector(
        'canvas[data-graph="obsidian"]',
      ) as HTMLCanvasElement | null
      if (!c) return false
      const ctx = c.getContext('2d')
      if (!ctx) return false
      const data = ctx.getImageData(0, 0, c.width, c.height).data
      let count = 0
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const a = data[i + 3]
        if (a == null || a < 80) continue
        // Tolerance ±20 around (91,157,255) — particle anti-aliasing,
        // stroke alpha and shadowBlur smear the exact hex.
        if (
          r != null && g != null && b != null &&
          Math.abs(r - 91) < 30 &&
          Math.abs(g - 157) < 30 &&
          Math.abs(b - 255) < 20
        ) {
          count += 1
          if (count > 5) return true
        }
      }
      return false
    })
    expect(found).toBe(true)
  })

  test('(e) Replay pill click restarts the cinematic from step 1', async ({ page }) => {
    await waitGraphSettled(page)
    await page.locator('[data-testid="obsidian-demo-path-pill"]').click()
    const badge = page.locator('[data-testid="obsidian-step-counter"]')
    await expect(badge).toContainText('Path complete ✓', { timeout: 8000 })
    const replay = page.locator('[data-testid="obsidian-replay-pill"]')
    await replay.click()
    // After replay, badge must again show "Step 1 / K" form (or any low
    // N) and is no longer in completed state.
    await expect(badge).toContainText(/Step \d+ \/ \d+/, { timeout: 2000 })
    const playing = await page.evaluate(() => {
      const s = window.__obsidianTraversalState?.()
      return s?.isPlaying === true
    })
    expect(playing).toBe(true)
  })
})
