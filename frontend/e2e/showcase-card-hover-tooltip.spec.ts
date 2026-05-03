// COVERAGE-AUDIT.md H12 — Showcase card hover tooltip (L14, V4).
//
// Each `<ShowcaseCard>` on the landing page renders a live mini ForceGraph2D
// inside the card header. On node hover, the card draws a cursor-tracked
// tooltip that shows `{name (label)}`. This is the most distinctive UX detail
// on the landing surface — a regression that broke `onNodeHover` plumbing,
// removed the cursor-tracked div, or accidentally hid the tooltip behind
// `overflow-hidden` would leave the cards looking flat without any test
// failure.
//
// We pin:
//   1. Triggering the card's node-hover handler spawns the
//      `showcase-card-tooltip` element with the correct dataset's first
//      node.
//   2. The tooltip exposes both a node title and a label subtitle, each
//      non-empty.
//   3. The tooltip is `pointer-events-none` so it never steals mouse-move
//      events from the canvas underneath — a regression that dropped this
//      rule would lock the tooltip onto the first hovered node forever.
//
// ForceGraph2D's hover detection rides on internal d3-zoom plumbing that
// playwright cannot deterministically drive via `page.mouse.move` over a
// running force simulation (positions move every frame). We use the
// `window.__showcaseHover[datasetKey]` test hook (registered by ShowcaseCard,
// mirrors the `__obsidian*` pattern in `Obsidian3DGraph`) to fire
// `handleNodeHover` on a known node — the same code path React runs when
// ForceGraph2D's `onNodeHover` callback fires in a real browser.

import { expect, test } from '@playwright/test'

declare global {
  interface Window {
    __showcaseHover?: Record<string, (nodeIndex: number) => void>
  }
}

test.describe('H12 · Showcase card hover tooltip', () => {
  test('triggering ShowcaseCard hover renders a tooltip with the node title + label', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.locator('#showcase').scrollIntoViewIfNeeded()
    const firstCard = page.getByTestId('showcase-card').first()
    await expect(firstCard).toBeVisible()

    // Wait for at least one card's hover hook to be registered — the cards
    // mount in parallel but the useEffect that publishes the hook runs after
    // the first paint, so a microtask wait keeps the test deterministic.
    await expect
      .poll(async () =>
        page.evaluate(
          () => Object.keys(window.__showcaseHover ?? {}).length,
        ),
      )
      .toBeGreaterThan(0)

    // Pre-hover: the tooltip must be absent — its mount is gated on
    // `hoveredNode !== null`, so a regression that always rendered the
    // tooltip would surface here.
    await expect(page.getByTestId('showcase-card-tooltip')).toHaveCount(0)

    // Drive the first registered card's hover with its first node. Using the
    // dataset key returned by the page (rather than hard-coding "movielens")
    // keeps the test resilient to landing-page reshuffles.
    await page.evaluate(() => {
      const hooks = window.__showcaseHover ?? {}
      const keys = Object.keys(hooks)
      if (keys.length === 0) throw new Error('no showcase hover hooks registered')
      hooks[keys[0]]?.(0)
    })

    const tooltip = page.getByTestId('showcase-card-tooltip').first()
    await expect(tooltip).toBeVisible()

    // Title comes from `node.properties.name|title|holder` or the node id;
    // subtitle defaults to the first label or 'Node'. Both must be non-empty.
    const title = page.getByTestId('showcase-card-tooltip-title').first()
    const subtitle = page.getByTestId('showcase-card-tooltip-subtitle').first()
    await expect(title).toBeVisible()
    await expect(subtitle).toBeVisible()
    await expect(title).not.toHaveText(/^\s*$/)
    await expect(subtitle).not.toHaveText(/^\s*$/)

    // The tooltip MUST be `pointer-events-none` — without this rule the
    // tooltip div would intercept further mouse moves and lock the cursor
    // onto the first node forever. Pin the computed style so a tailwind
    // reshuffle can't silently drop the rule.
    await expect(tooltip).toHaveCSS('pointer-events', 'none')

    // Clearing the hover removes the tooltip — proves the gating works in
    // both directions, not just on mount.
    await page.evaluate(() => {
      const hooks = window.__showcaseHover ?? {}
      const keys = Object.keys(hooks)
      hooks[keys[0]]?.(-1)
    })
    await expect(page.getByTestId('showcase-card-tooltip')).toHaveCount(0)
  })
})
