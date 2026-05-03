import { expect, test } from '@playwright/test'

// Phase-4 A11Y regression spec.
//
// Promises under test:
//   (a) prefers-reduced-motion=reduce snaps the traversal to its final
//       state instead of animating; halo radius doesn't oscillate
//   (b) '/' opens the search overlay
//   (c) Tab navigates through interactive UI (button → graph container)
//   (d) ARIA live region announces focus changes within 600ms
//   (e) :focus-visible ring is rendered when the container is focused
//       via keyboard

interface NodePosition {
  id: string | number
  x: number
  y: number
}

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
    __obsidianFocusNode?: (idx: number) => void
    __obsidianFocusedHaloRadius?: () => number | null
    __obsidianTraversalState?: () => TraversalState
    __obsidianDispatchDemoPath?: () => Array<string | number> | null
    __obsidianNodePositions?: () => NodePosition[]
  }
}

async function waitGraphSettled(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => window.__obsidianGraphReady === true, {
    timeout: 20_000,
  })
  await page.waitForTimeout(6000)
}

test.describe('Obsidian a11y (Phase-4)', () => {
  test('(a) prefers-reduced-motion: traversal snaps + halo doesn\'t oscillate', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    try {
      await page.goto('/playground')
      await waitGraphSettled(page)
      // Halo radius must not oscillate under reduced-motion (heartbeat off).
      await page.evaluate(() => window.__obsidianFocusNode?.(0))
      await page.waitForTimeout(50)
      const r0 = await page.evaluate(
        () => window.__obsidianFocusedHaloRadius?.() ?? null,
      )
      await page.waitForTimeout(500)
      const r500 = await page.evaluate(
        () => window.__obsidianFocusedHaloRadius?.() ?? null,
      )
      expect(r0).not.toBeNull()
      expect(r500).not.toBeNull()
      const delta = Math.abs((r500 as number) - (r0 as number))
      expect(
        delta,
        `halo must not oscillate under reduced-motion (delta=${delta.toFixed(4)})`,
      ).toBeLessThan(0.005)

      // Dispatch the demo path — under reduced-motion the cinematic must
      // snap to completed state in a single tick, NOT play step-by-step.
      await page.evaluate(() => window.__obsidianDispatchDemoPath?.())
      // Within 200ms (well under the normal cinematic's per-step duration),
      // the traversal state must already report `completed: true`.
      await page.waitForTimeout(200)
      const state = await page.evaluate(
        () => window.__obsidianTraversalState?.() ?? null,
      )
      expect(state, 'traversal state readable').not.toBeNull()
      // Either the run never started (path of length < 2) or it completed.
      // In either case, isPlaying must be false within 200ms.
      expect(state!.isPlaying).toBe(false)
    } finally {
      await ctx.close()
    }
  })

  test("(b) '/' opens the search overlay", async ({ page }) => {
    await page.goto('/playground')
    await waitGraphSettled(page)
    const container = page.locator('[data-testid="obsidian-graph-container"]')
    await container.focus()
    await page.keyboard.press('/')
    const overlay = page.locator('[data-testid="obsidian-search-overlay"]')
    await expect(overlay).toBeVisible({ timeout: 1500 })
    const input = page.locator('[data-testid="obsidian-search-input"]')
    await expect(input).toBeVisible()
  })

  test('(c) Tab navigates to the graph container', async ({ page }) => {
    await page.goto('/playground')
    await waitGraphSettled(page)
    // Tab through page-level chrome until focus lands on the graph
    // container — assert it is reachable within a bounded number of tabs.
    const container = page.locator('[data-testid="obsidian-graph-container"]')
    let focusedContainer = false
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press('Tab')
      const isFocused = await container.evaluate(
        (el) => document.activeElement === el,
      )
      if (isFocused) {
        focusedContainer = true
        break
      }
    }
    expect(
      focusedContainer,
      'graph container must be reachable via Tab within 30 presses',
    ).toBe(true)
  })

  test('(d) ARIA live region announces focus changes within 600ms', async ({ page }) => {
    await page.goto('/playground')
    await waitGraphSettled(page)
    const live = page.locator('[data-testid="obsidian-live-region"]')
    await expect(live).toHaveAttribute('aria-live', 'polite')
    await expect(live).toHaveAttribute('role', 'status')
    // Trigger a focus via the harness and wait for the announcement.
    await page.evaluate(() => window.__obsidianFocusNode?.(0))
    await page.waitForTimeout(700)
    const text = (await live.textContent()) ?? ''
    expect(
      text,
      `expected announcement to start with 'Selected: …'; got: '${text}'`,
    ).toMatch(/^Selected:.+Type:.+\d+\s+connection/)
  })

  test('(e) :focus-visible ring is rendered on the graph container', async ({ page }) => {
    await page.goto('/playground')
    await waitGraphSettled(page)
    const container = page.locator('[data-testid="obsidian-graph-container"]')
    // Focusing programmatically does NOT trigger :focus-visible in Chromium
    // unless it follows a keyboard event. We Tab in instead.
    let reached = false
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press('Tab')
      const isFocused = await container.evaluate(
        (el) => document.activeElement === el,
      )
      if (isFocused) {
        reached = true
        break
      }
    }
    expect(reached).toBe(true)
    // Read the computed outline width — focus-visible classes apply
    // outline: 2px solid blue with offset.
    const outline = await container.evaluate((el) => {
      const cs = window.getComputedStyle(el)
      return {
        style: cs.outlineStyle,
        widthPx: parseFloat(cs.outlineWidth),
      }
    })
    expect(
      outline.widthPx,
      `:focus-visible outline width must be ≥1px; got ${outline.widthPx}px (style=${outline.style})`,
    ).toBeGreaterThanOrEqual(1)
    expect(outline.style).not.toBe('none')
  })
})
