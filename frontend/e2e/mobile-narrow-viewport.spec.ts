// COVERAGE-AUDIT.md H10 — mobile (375 px) coverage for marketing/info routes.
//
// `eval-cycle1-mobile.spec.ts` already pins `/playground` against horizontal
// overflow at 375 × 812, but the audit flagged the three other user-facing
// routes — `/`, `/claims`, `/docs/:slug` — as untested at narrow widths
// (SB30). Each is a conversion or trust surface: the landing hero is the
// first page a developer hits, the claims page is what they read to decide
// whether the product's promises are real, and the docs route is where they
// land from "Read the pattern" links in the AI integration cards. A regression
// that introduces a stray min-width or overflow-x:auto wrapper on any of
// these pages would silently produce side-scroll on real phones.
//
// We assert two things per route:
//   1. `documentElement.scrollWidth <= window.innerWidth + 2` — i.e. no
//      horizontal overflow (the +2 tolerates fractional-pixel rounding).
//   2. The route's defining content is visible — proves the layout reflowed
//      rather than collapsing the primary call-to-action below the fold.
//
// We use `setViewportSize` + `addInitScript`-pinned `innerWidth` (mirroring
// the existing playground spec) so the test runs under the default chromium
// project without needing a separate device profile.

import { expect, test, type Page } from '@playwright/test'

async function setMobileViewport(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'innerWidth', { value: 375 })
  })
  await page.setViewportSize({ width: 375, height: 812 })
}

async function assertNoHorizontalOverflow(page: Page, route: string) {
  const docW = await page.evaluate(() => document.documentElement.scrollWidth)
  const winW = await page.evaluate(() => window.innerWidth)
  expect(
    docW,
    `[${route}] documentElement.scrollWidth=${docW} > windowW=${winW} — page introduces horizontal overflow at 375 px`,
  ).toBeLessThanOrEqual(winW + 2)
}

test.describe('H10 · mobile narrow viewport (375 px) — landing / claims / docs', () => {
  test.beforeEach(async ({ page }) => {
    await setMobileViewport(page)
  })

  test('landing `/` reflows without horizontal overflow and keeps the hero CTA reachable', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Hero heading is the conversion-critical content; if it isn't visible at
    // 375 px the layout is broken regardless of overflow.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // The "Open the playground" hero CTA must still be reachable on mobile —
    // its presence (not its position) is what we pin here, otherwise narrow
    // widths could collapse it behind a hamburger that doesn't exist.
    await expect(page.locator('a[href="/playground"]').first()).toBeVisible()

    await assertNoHorizontalOverflow(page, '/')
  })

  test('claims `/claims` reflows without horizontal overflow and shows the ready container', async ({
    page,
  }) => {
    await page.goto('/claims')
    // /claims-status.json is served from disk by the dev server; wait for the
    // ready branch (the claims-table only mounts under state.kind === 'ready')
    // so we're not asserting overflow on a transient skeleton layout.
    await expect(page.getByTestId('claims-table')).toBeVisible()

    await assertNoHorizontalOverflow(page, '/claims')
  })

  test('docs `/docs/:slug` reflows without horizontal overflow and renders the article', async ({
    page,
  }) => {
    await page.goto('/docs/llm-to-cypher')
    await expect(page.getByTestId('doc-page-article')).toBeVisible()

    await assertNoHorizontalOverflow(page, '/docs/llm-to-cypher')
  })
})
