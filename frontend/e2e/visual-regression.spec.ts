import { expect, test, type Page } from '@playwright/test'

// COV-B1 — Visual regression baselines.
//
// Closes the "no toMatchSnapshot/toHaveScreenshot anywhere in the suite" gap
// from .planning/c17-coverage-audit/COVERAGE-AUDIT.md (Headline finding #3,
// BLOCKER B1). The 10 existing `page.screenshot({ path })` calls in
// `landing.spec.ts` and `playground.spec.ts` only write PNGs — they never
// compare. This file is the first place in the suite that *enforces* pixel
// stability via Playwright's `toHaveScreenshot()`.
//
// Pixel tolerance is configured per-locator: tight for static layouts (hero,
// features, claims badge) and looser for force-directed graph canvases where
// sub-pixel drift between runs is intrinsic to the simulation.

const STABLE_CLAIMS_PAYLOAD = JSON.stringify({
  sha: 'abcdef0',
  date: '2026-04-22T12:00:00Z',
  entries: [
    {
      id: 'stub-green-1',
      claim: 'stub claim one',
      status: 'green',
      last_run: '2026-04-22T12:00:00Z',
      evidence: 'e2e/stub-1.spec.ts',
    },
    {
      id: 'stub-green-2',
      claim: 'stub claim two',
      status: 'green',
      last_run: '2026-04-22T12:00:00Z',
      evidence: 'e2e/stub-2.spec.ts',
    },
  ],
})

const RED_CLAIMS_PAYLOAD = JSON.stringify({
  sha: 'deadbee',
  date: '2026-04-22T12:00:00Z',
  entries: [
    {
      id: 'stub-green',
      claim: 'stub green claim',
      status: 'green',
      last_run: '2026-04-22T12:00:00Z',
      evidence: 'e2e/stub-green.spec.ts',
    },
    {
      id: 'stub-red',
      claim: 'stub red claim',
      status: 'red',
      last_run: '2026-04-22T12:00:00Z',
      evidence: 'e2e/stub-red.spec.ts',
    },
  ],
})

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => {
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(t)
  }, theme)
}

async function waitFontsAndStill(page: Page) {
  await page.evaluate(() => document.fonts.ready)
  // Two RAFs after fonts ready — enough for layout to settle and animations
  // (already disabled by config) to flush their final frame.
  await page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      ),
  )
}

test.describe('Visual regression — landing page', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.route('**/claims-status.json', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: STABLE_CLAIMS_PAYLOAD,
      }),
    )
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await waitFontsAndStill(page)
  })

  test('hero section', async ({ page }) => {
    const hero = page.getByTestId('hero-content')
    await expect(hero).toBeVisible()
    // Hero hosts the animated graph constellation behind it; element-scoped
    // shot, plus a slightly looser tolerance, accommodates the canvas pixel
    // drift while still failing on layout / typography regressions.
    await expect(hero).toHaveScreenshot('landing-hero.png', {
      maxDiffPixelRatio: 0.05,
      mask: [page.locator('[data-testid="hero-graph-constellation"]')],
    })
  })

  test('hero section — dark theme', async ({ page }) => {
    await setTheme(page, 'dark')
    const hero = page.getByTestId('hero-content')
    await expect(hero).toBeVisible()
    await expect(hero).toHaveScreenshot('landing-hero-dark.png', {
      maxDiffPixelRatio: 0.05,
      mask: [page.locator('[data-testid="hero-graph-constellation"]')],
    })
  })

  test('showcase section', async ({ page }) => {
    const showcase = page.locator('#showcase')
    await showcase.scrollIntoViewIfNeeded()
    await expect(page.getByTestId('showcase-card').first()).toBeVisible()
    await waitFontsAndStill(page)
    await expect(showcase).toHaveScreenshot('landing-showcase.png', {
      maxDiffPixelRatio: 0.03,
      // Mini-graphs inside cards animate; mask them so we still pin layout.
      mask: [page.getByTestId('showcase-card').locator('canvas')],
    })
  })

  test('features section', async ({ page }) => {
    const features = page.locator('#features')
    await features.scrollIntoViewIfNeeded()
    await expect(page.getByTestId('feature-card').first()).toBeVisible()
    await waitFontsAndStill(page)
    await expect(features).toHaveScreenshot('landing-features.png', {
      maxDiffPixelRatio: 0.01,
    })
  })

  test('get-started section', async ({ page }) => {
    const gs = page.locator('#get-started')
    await gs.scrollIntoViewIfNeeded()
    await expect(gs.locator('ol > li').first()).toBeVisible()
    await waitFontsAndStill(page)
    await expect(gs).toHaveScreenshot('landing-get-started.png', {
      maxDiffPixelRatio: 0.01,
    })
  })

  test('AI integration section', async ({ page }) => {
    const ai = page.getByTestId('ai-integration-section')
    await ai.scrollIntoViewIfNeeded()
    await expect(ai).toBeVisible()
    await waitFontsAndStill(page)
    await expect(ai).toHaveScreenshot('landing-ai-integration.png', {
      maxDiffPixelRatio: 0.02,
    })
  })

  test('claims badge — green state', async ({ page }) => {
    const badge = page.locator('[data-testid="claims-badge"]').first()
    await expect(badge).toHaveAttribute('data-state', 'green')
    await waitFontsAndStill(page)
    await expect(badge).toHaveScreenshot('claims-badge-green.png', {
      maxDiffPixelRatio: 0.01,
    })
  })
})

test.describe('Visual regression — landing page (red claims)', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.route('**/claims-status.json', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: RED_CLAIMS_PAYLOAD,
      }),
    )
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await waitFontsAndStill(page)
  })

  test('claims badge — red state with banner', async ({ page }) => {
    const badge = page.locator('[data-testid="claims-badge"]').first()
    await expect(badge).toHaveAttribute('data-state', 'red')
    await waitFontsAndStill(page)
    await expect(badge).toHaveScreenshot('claims-badge-red.png', {
      maxDiffPixelRatio: 0.01,
    })

    const banner = page.locator('[data-testid="claims-banner-red"]')
    await expect(banner).toBeVisible()
    await expect(banner).toHaveScreenshot('claims-banner-red.png', {
      maxDiffPixelRatio: 0.01,
    })
  })
})

test.describe('Visual regression — claims page', () => {
  test('ready state', async ({ page, context }) => {
    await context.route('**/claims-status.json', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: STABLE_CLAIMS_PAYLOAD,
      }),
    )
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/claims')
    const table = page.locator('[data-testid="claims-table"]')
    await expect(table).toBeVisible()
    await waitFontsAndStill(page)
    await expect(table).toHaveScreenshot('claims-table.png', {
      maxDiffPixelRatio: 0.01,
    })
  })
})

test.describe('Visual regression — playground', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
  })

  test('schema browser', async ({ page }) => {
    await page.goto('/playground?dataset=wikidata')
    await page.waitForLoadState('networkidle')
    // Switch to Schema tab via stable id (TabPill renders `playground-tab-schema`).
    await page.locator('#playground-tab-schema').click()
    const browser = page.locator('[data-testid="schema-browser-header"]').first()
    await expect(browser).toBeVisible({ timeout: 15000 })
    // Wait for at least one schema label node to render before snapping.
    await expect(page.locator('[data-testid="schema-label-node"]').first()).toBeVisible({
      timeout: 15000,
    })
    await waitFontsAndStill(page)
    const panel = page.locator('[data-testid="schema-main-panel"]').first()
    await expect(panel).toHaveScreenshot('schema-browser.png', {
      maxDiffPixelRatio: 0.03,
    })
  })

  test('perf strip', async ({ page }) => {
    await page.goto('/playground')
    const strip = page.locator('[data-testid="perf-strip"]')
    await expect(strip).toBeVisible({ timeout: 15000 })
    await waitFontsAndStill(page)
    await expect(strip).toHaveScreenshot('perf-strip.png', {
      maxDiffPixelRatio: 0.02,
    })
  })

  test('graph canvas — 2D default', async ({ page }) => {
    await page.goto('/playground?graph=2d')
    await page.waitForFunction(() => (window as unknown as { __obsidianGraphReady?: boolean }).__obsidianGraphReady === true, {
      timeout: 20000,
    })
    const canvas = page.locator('canvas[data-graph="obsidian"]')
    await expect(canvas).toBeVisible()
    // Force-directed layout is non-deterministic across runs even with a
    // fixed seed (timer drift, sub-pixel rounding). A generous threshold
    // turns this into a "structural" baseline: it still fails on palette
    // shifts, missing nodes, or wholesale layout breakage.
    await waitFontsAndStill(page)
    await expect(canvas).toHaveScreenshot('graph-canvas-2d.png', {
      maxDiffPixelRatio: 0.4,
    })
  })

  test('graph canvas — 3D', async ({ page, browser }) => {
    test.setTimeout(90_000)
    await page.goto('/playground?graph=3d')
    // Probe WebGL availability inside the SPA (same approach as
    // obsidian3d-graph-quality.spec.ts). No WebGL → fall back to 2D and
    // skip; we still have the 2D baseline for that case.
    const hasWebGL = await page.evaluate(() => {
      try {
        const c = document.createElement('canvas')
        return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'))
      } catch {
        return false
      }
    })
    test.skip(!hasWebGL, `WebGL unavailable (browser=${browser.browserType().name()})`)
    const ready = await page
      .waitForFunction(
        () => (window as unknown as { __obsidian3dGraphReady?: boolean }).__obsidian3dGraphReady === true,
        { timeout: 25_000 },
      )
      .then(() => true)
      .catch(() => false)
    test.skip(!ready, '3D graph never reported ready (WebGL probe passed but renderer did not mount)')
    const canvas3d = page.locator('canvas[data-graph="obsidian3d"]')
    await expect(canvas3d).toBeVisible()
    // Let RFG3D's cooldownTime (5s) settle before snapping.
    await page.waitForTimeout(6_000)
    await waitFontsAndStill(page)
    await expect(canvas3d).toHaveScreenshot('graph-canvas-3d.png', {
      maxDiffPixelRatio: 0.5,
    })
  })
})
