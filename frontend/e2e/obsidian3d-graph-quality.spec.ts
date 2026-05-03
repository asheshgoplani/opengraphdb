// Obsidian3DGraph quality gates — parallel structure to
// `obsidian-graph-quality.spec.ts`, but exercises the c14
// react-force-graph-3d renderer instead of the legacy 2D canvas.
//
// Headless WebGL note: the project-level chromium launch
// (playwright.config.ts) requests SwiftShader. In some environments
// (containerised / no GPU) SwiftShader is unavailable anyway and a
// real WebGL context cannot be obtained. The "WebGL fallback works"
// test below ALWAYS runs and validates the degraded path; the full
// 3D-render tests `test.skip()` themselves at runtime when WebGL is
// missing rather than report false failures.
import { expect, test, type Page } from '@playwright/test'

declare global {
  interface Window {
    __obsidian3dGraphReady?: boolean
    __obsidian3dHoverNode?: (idx: number) => void
    __obsidian3dDimmedCount?: () => number
    __obsidian3dFitCount?: () => number
    __obsidian3dEntryAnimated?: () => boolean
    __obsidian3dEntryFocusId?: () => string | number | null
    __obsidian3dHubLabelIds?: () => Array<string | number>
    __obsidian3dHasWebGL?: () => boolean
    // The 2D harness flag — referenced by the WebGL-fallback test
    // below; declared by the 2D ObsidianGraph component itself.
    __obsidianGraphReady?: boolean
  }
}

async function probeWebGL(page: Page): Promise<boolean> {
  await page.goto('/playground')
  return page.evaluate(() => {
    try {
      const c = document.createElement('canvas')
      return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'))
    } catch {
      return false
    }
  })
}

async function waitGraph3DSettled(page: Page) {
  await page.goto('/playground')
  await page.waitForFunction(() => window.__obsidian3dGraphReady === true, {
    timeout: 25_000,
  })
  // RFG3D's cooldownTime is 5 s; give it a beat to settle so onEngineStop
  // has fired and the entry-dolly captured a target id.
  await page.waitForTimeout(6_000)
}

test.describe('Obsidian3DGraph routing & WebGL fallback (always-on)', () => {
  test('?graph=2d explicitly opts back into the legacy 2D ObsidianGraph', async ({
    page,
  }) => {
    await page.goto('/playground?graph=2d')
    await page.waitForFunction(() => window.__obsidianGraphReady === true, {
      timeout: 20_000,
    })
    await page.waitForTimeout(3_000)
    const wrapper = page.locator('[data-graph-mode="2d"]').first()
    await expect(wrapper).toBeVisible()
    // `data-graph-fallback="mode"` is set when the user *asked* for 2D.
    await expect(wrapper).toHaveAttribute('data-graph-fallback', 'mode')
    await expect(page.locator('canvas[data-graph="obsidian"]')).toBeVisible()
    await expect(page.locator('canvas[data-graph="obsidian3d"]')).toHaveCount(0)
  })

  test('default route picks 3D-or-2D-fallback based on WebGL availability', async ({
    page,
  }) => {
    await page.goto('/playground')
    // Either path must land within 25 s.
    await page.waitForFunction(
      () =>
        window.__obsidian3dGraphReady === true ||
        window.__obsidianGraphReady === true,
      { timeout: 25_000 },
    )
    const wrapper = page.locator('[data-graph-mode]').first()
    const mode = await wrapper.getAttribute('data-graph-mode')
    expect(['2d', '3d']).toContain(mode)
    if (mode === '2d') {
      // The only legitimate reason for 2D on the default route is
      // WebGL being unavailable.
      await expect(wrapper).toHaveAttribute('data-graph-fallback', 'webgl')
      await expect(page.locator('canvas[data-graph="obsidian"]')).toBeVisible()
    } else {
      await expect(page.locator('canvas[data-graph="obsidian3d"]')).toBeVisible()
    }
  })
})

test.describe('Obsidian3DGraph rendered behaviour (skipped when WebGL absent)', () => {
  test('WebGL-mounted: hovering a node tiers the neighbourhood', async ({ page }) => {
    if (!(await probeWebGL(page))) test.skip(true, 'WebGL unavailable in this runner')
    await waitGraph3DSettled(page)
    const before = await page.evaluate(
      () => window.__obsidian3dDimmedCount?.() ?? -1,
    )
    expect(before, 'baseline dimmed count must be 0 with no focus').toBe(0)
    await page.evaluate(() => window.__obsidian3dHoverNode?.(0))
    await page.waitForTimeout(300)
    const after = await page.evaluate(
      () => window.__obsidian3dDimmedCount?.() ?? -1,
    )
    expect(
      after,
      `expected dimmed count > 0 after hovering node[0]; got ${after}`,
    ).toBeGreaterThan(0)
  })

  test('WebGL-mounted: entry dolly fires on first cool — focus id captured', async ({
    page,
  }) => {
    if (!(await probeWebGL(page))) test.skip(true, 'WebGL unavailable in this runner')
    await waitGraph3DSettled(page)
    const animated = await page.evaluate(
      () => window.__obsidian3dEntryAnimated?.() ?? false,
    )
    expect(animated, 'entry-animated flag must be true after settle').toBe(true)
    const focusId = await page.evaluate(
      () => window.__obsidian3dEntryFocusId?.() ?? null,
    )
    expect(
      focusId,
      'entry-focus id must be a node id (top-1 hub by degree), not null',
    ).not.toBeNull()
    const fitCount = await page.evaluate(
      () => window.__obsidian3dFitCount?.() ?? 0,
    )
    expect(
      fitCount,
      `expected ≥1 onEngineStop firings after settle; got ${fitCount}`,
    ).toBeGreaterThan(0)
  })

  test('WebGL-mounted: top-N hub labels include the entry-focus id', async ({
    page,
  }) => {
    if (!(await probeWebGL(page))) test.skip(true, 'WebGL unavailable in this runner')
    await waitGraph3DSettled(page)
    const ids = await page.evaluate(
      () => window.__obsidian3dHubLabelIds?.() ?? [],
    )
    expect(
      ids.length,
      `expected ≥1 hub-label ids at first paint; got ${ids.length}`,
    ).toBeGreaterThan(0)
    const focusId = await page.evaluate(
      () => window.__obsidian3dEntryFocusId?.() ?? null,
    )
    expect(ids).toContain(focusId)
  })

  test('WebGL-mounted: explicit ?graph=3d still works (proto-era share-link compat)', async ({
    page,
  }) => {
    if (!(await probeWebGL(page))) test.skip(true, 'WebGL unavailable in this runner')
    await page.goto('/playground?graph=3d')
    await page.waitForFunction(() => window.__obsidian3dGraphReady === true, {
      timeout: 25_000,
    })
    await expect(page.locator('canvas[data-graph="obsidian3d"]')).toBeVisible()
    const live = await page.evaluate(
      () => window.__obsidian3dHasWebGL?.() ?? false,
    )
    expect(live).toBe(true)
  })
})
