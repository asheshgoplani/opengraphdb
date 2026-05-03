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
  // Probe must run inside the SPA so canvas creation honors the
  // launch-flag-driven ANGLE/swiftshader binding. Default playground
  // path is now 2D; WebGL availability is independent of route.
  await page.goto('/playground?graph=3d')
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
  // Phase-1 GLOW reverted defaults to 2D; the 3D scene is now an opt-in
  // power-user toggle behind `?graph=3d`. All "WebGL-mounted" tests must
  // explicitly request the 3D mode.
  await page.goto('/playground?graph=3d')
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

  test('default route lands on the 2D ObsidianGraph (phase-1 GLOW default)', async ({
    page,
  }) => {
    // Phase-1 GLOW: defaults flipped back from 3D → 2D. The default
    // route must mount the legacy 2D canvas regardless of WebGL
    // availability; the 3D scene is reachable only via `?graph=3d`.
    await page.goto('/playground')
    await page.waitForFunction(() => window.__obsidianGraphReady === true, {
      timeout: 25_000,
    })
    const wrapper = page.locator('[data-graph-mode="2d"]').first()
    await expect(wrapper).toBeVisible()
    await expect(page.locator('canvas[data-graph="obsidian"]')).toBeVisible()
    await expect(page.locator('canvas[data-graph="obsidian3d"]')).toHaveCount(0)
  })

  test('?graph=3d on a WebGL-less browser falls back to 2D with reason="webgl"', async ({
    page,
  }) => {
    // Synthesize a WebGL-less environment by stubbing
    // HTMLCanvasElement.getContext for `webgl`/`webgl2` BEFORE the SPA
    // boots, so `hasWebGL()` returns false at module-load time.
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
          return null as unknown as RenderingContext
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (orig as any).call(this, type, ...rest)
      } as typeof HTMLCanvasElement.prototype.getContext
    })
    await page.goto('/playground?graph=3d')
    await page.waitForFunction(() => window.__obsidianGraphReady === true, {
      timeout: 25_000,
    })
    const wrapper = page.locator('[data-graph-mode="2d"]').first()
    await expect(wrapper).toHaveAttribute('data-graph-fallback', 'webgl')
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
