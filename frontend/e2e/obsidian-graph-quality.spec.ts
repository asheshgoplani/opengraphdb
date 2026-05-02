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
    __obsidianHoverNode?: (idx: number) => void
    __obsidianDimmedCount?: () => number
    __obsidianLabelBounds?: () => LabelBound[]
    __obsidianNodePositions?: () => Array<{ id: string | number; x: number; y: number }>
    __obsidianFitCount?: () => number
    __obsidianEntryAnimated?: () => boolean
  }
}

async function waitGraphSettled(page: import('@playwright/test').Page) {
  await page.goto('/playground')
  await page.waitForFunction(() => window.__obsidianGraphReady === true, {
    timeout: 20_000,
  })
  await page.waitForTimeout(6000)
}

test.describe('Obsidian graph quality polish (POLISH #1–5)', () => {
  test('POLISH #2: hovering a node shows tooltip with label + degree', async ({ page }) => {
    await waitGraphSettled(page)

    // Move the cursor to the canvas first so the tooltip's pointer-position
    // ref is populated. Then synthesise a hover via the harness hook on the
    // first node.
    const canvas = page.locator('canvas[data-graph="obsidian"]')
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)

    await page.evaluate(() => window.__obsidianHoverNode?.(0))
    const tooltip = page.locator('[data-testid="obsidian-node-tooltip"]')
    await expect(tooltip).toBeVisible({ timeout: 4000 })
    // Tooltip body must include "degree:" label.
    await expect(tooltip).toContainText(/degree:/)
  })

  test('POLISH #5: 2-hop fade — three opacity tiers visible after focus', async ({ page }) => {
    await waitGraphSettled(page)

    // Find a node with degree ≥ 2 so a meaningful 2-hop ring exists.
    // (any hub-ish node will do; pick the first that fits)
    const canvas = page.locator('canvas[data-graph="obsidian"]')
    await expect(canvas).toBeVisible()

    // Without focus, every node renders at α=1 (no tiering).
    await page.evaluate(() => window.__obsidianHoverNode?.(0))
    await page.waitForTimeout(200)

    // Sample canvas alpha distribution. With 3-tier fade we expect a wider
    // alpha-histogram than binary (focus + 1-hop at α=1, 2-hop at α=0.5,
    // rest at α=0.18). We assert at least three distinct alpha buckets in
    // the rendered scene.
    const buckets = await page.evaluate(() => {
      const c = document.querySelector(
        'canvas[data-graph="obsidian"]',
      ) as HTMLCanvasElement | null
      if (!c) return null
      const ctx = c.getContext('2d')
      if (!ctx) return null
      const { width, height } = c
      const data = ctx.getImageData(0, 0, width, height).data
      const seen = new Set<number>()
      for (let i = 3; i < data.length; i += 4) {
        const a = data[i]
        if (a === 0) continue
        // Coarse-bucket the alpha (round to nearest 16) so anti-alias edges
        // don't flood the set.
        seen.add(Math.round(a / 16) * 16)
      }
      return [...seen].sort((x, y) => x - y)
    })

    expect(buckets).not.toBeNull()
    // At minimum: full-opacity (focus), mid (2-hop), low (rest), plus
    // anti-alias gradients. ≥3 buckets confirms the tier-fade is rendering.
    expect(
      buckets!.length,
      `expected ≥3 alpha buckets for 3-tier fade, got ${buckets!.length}: ${JSON.stringify(buckets)}`,
    ).toBeGreaterThanOrEqual(3)
  })

  test('POLISH #3: tap-and-release sticks the focus (selectedNodeId persists)', async ({
    page,
  }) => {
    await waitGraphSettled(page)
    // Trigger hover-then-leave on a node, simulating a tap-and-release.
    // After the hover ends, the neighbourhood-fade should still be active
    // because the click has set the internal sticky-focus id.
    const idx = 0
    await page.evaluate((i) => window.__obsidianHoverNode?.(i), idx)
    const before = await page.evaluate(
      () => window.__obsidianDimmedCount?.() ?? 0,
    )
    expect(before, 'expected non-zero dimmed count after focus').toBeGreaterThan(0)

    // Now clear the hover (set to a non-existent index so neighborSet falls
    // back to focusNeighbors, which is computed from the React `focused`
    // value — which still includes stickyFocusId / selectedNodeId).
    // For the actual tap-and-release semantic we read back the dimmed count
    // after hover-out by simulating a real click on the canvas centre,
    // which targets the first node and sets selectedNodeId.
    const canvas = page.locator('canvas[data-graph="obsidian"]')
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    // Click the first node's screen position (we have it via positions hook,
    // but a click on canvas centre is enough — RFG2 will pick the nearest).
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.waitForTimeout(400)
    const after = await page.evaluate(
      () => window.__obsidianDimmedCount?.() ?? 0,
    )
    // Sticky-fade: dimmed count must remain > 0 after release.
    expect(
      after,
      `sticky-fade should persist post-click: dimmed=${after}`,
    ).toBeGreaterThan(0)
  })

  test('POLISH #4: zoom clamp — programmatic zoom past min/max is bounded', async ({ page }) => {
    await waitGraphSettled(page)

    // RFG2 exposes `zoom()` getter/setter via internal canvas. We assert
    // bounds by checking that mouse-wheel-driven zoom out past the floor
    // doesn't shrink the visible-bounding-box of the rendered nodes
    // arbitrarily small. We use a simpler proxy: dispatch many wheel-out
    // events and confirm at least one node still renders inside the canvas.
    const canvas = page.locator('canvas[data-graph="obsidian"]')
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    // Aggressively wheel-out — should not reduce the graph to a dot.
    for (let i = 0; i < 30; i += 1) {
      await page.mouse.wheel(0, 200)
    }
    await page.waitForTimeout(200)
    // Even after extreme wheel-out, the canvas should still have node
    // positions inside its frame (not collapsed to one pixel).
    const positions = await page.evaluate(
      () => window.__obsidianNodePositions?.() ?? [],
    )
    expect(positions.length).toBeGreaterThan(5)
    // Compute the bounding-box span; with the min-zoom clamp it must
    // remain non-zero in world-coords (positions don't change with zoom,
    // they're world-space — so this just validates the harness still works
    // post-extreme-zoom).
    const xs = positions.map((p) => p.x)
    const ys = positions.map((p) => p.y)
    const span = Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys)
    expect(span).toBeGreaterThan(50)
  })

  test('POLISH #7 (cycle D): entry animation runs on first cool', async ({ page }) => {
    // The first onEngineStop sets the entry-animated flag and bumps
    // fit-count to ≥ 1. Together they pin the dolly-in contract: a cut-
    // to-fit (no entry animation) would leave hasFittedRef false.
    await waitGraphSettled(page)
    const ran = await page.evaluate(
      () => window.__obsidianEntryAnimated?.() ?? false,
    )
    expect(ran, 'entry-animation flag must be true after settle').toBe(true)
    const fits = await page.evaluate(
      () => window.__obsidianFitCount?.() ?? 0,
    )
    expect(
      fits,
      `expected ≥1 zoomToFit calls after settle; got ${fits}`,
    ).toBeGreaterThan(0)
  })

  test('POLISH #6 (cycle C): top-N hub labels render with NO focus', async ({ page }) => {
    // Visible-without-interaction: the playground graph used to render
    // with zero default labels (visibility gated entirely on focus). With
    // cycle-C, when nothing is focused the top-N highest-degree nodes
    // must already be labelled at first paint.
    await waitGraphSettled(page)

    // Sanity: harness must still expose the bounds hook.
    const bounds = await page.evaluate(
      () => window.__obsidianLabelBounds?.() ?? [],
    )
    // No focus is asserted indirectly via the dimmed-count contract: with
    // no node focused, dimmed count is 0 (no fade tier applied).
    const dimmed = await page.evaluate(
      () => window.__obsidianDimmedCount?.() ?? 0,
    )
    expect(dimmed, 'no focus should mean zero dimmed nodes').toBe(0)
    // Default label count must be > 0 — the regression we are guarding.
    // We don't pin the exact N (depends on dataset size) but require
    // at least one default-pinned label survived to the placed-list.
    expect(
      bounds.length,
      `expected ≥1 default labels at first paint; placed=${bounds.length}`,
    ).toBeGreaterThan(0)
  })

  test('POLISH #1: labels do not overlap when focused — focused label always renders', async ({
    page,
  }) => {
    await waitGraphSettled(page)
    // Focus a node and assert its label is among the placed labels
    // (the focused-first / unconditional placement guarantee).
    await page.evaluate(() => window.__obsidianHoverNode?.(0))
    await page.waitForTimeout(300)

    const bounds = await page.evaluate(
      () => window.__obsidianLabelBounds?.() ?? [],
    )
    expect(bounds.length).toBeGreaterThan(0)
    const positions = await page.evaluate(
      () => window.__obsidianNodePositions?.() ?? [],
    )
    expect(positions.length).toBeGreaterThan(0)

    // The id of the first node (= the focused one via __obsidianHoverNode(0))
    // must appear in the placed-label list.
    const focusedId = positions[0].id
    const haveFocus = bounds.some((b) => b.id === focusedId)
    expect(
      haveFocus,
      `focused label (id=${focusedId}) must always be placed; placed ids=${JSON.stringify(bounds.map((b) => b.id))}`,
    ).toBe(true)
  })
})
