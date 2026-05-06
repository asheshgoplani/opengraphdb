// Runtime WebGL probe + skip helper for e2e specs whose assertions depend on
// pixel-level rendering of the Obsidian-graph canvas.
//
// On the GitHub Actions chromium runner, SwiftShader sometimes fails to bring
// up a usable WebGL context (the launchOptions in playwright.config.ts request
// it but the runner GPU stack does not always honor the request). When that
// happens, react-force-graph's regl init silently falls back to an empty
// canvas, and any pixel-histogram assertion turns into a flaky red. The
// canonical fix is to gate the *pixel* assertion on the actual capability of
// the browser at run-time, so the spec either:
//
//   (a) verifies the visual contract when WebGL is up, or
//   (b) skips with a clear reason when the runner cannot paint.
//
// Usage (call AFTER `page.goto(...)` so the document exists):
//
//   import { requireWebGL } from './_helpers/webgl-availability'
//
//   test('halo paints', async ({ page }) => {
//     await page.goto('/playground')
//     await requireWebGL(page)
//     // ... pixel-level assertions
//   })
//
// `hasWebGL(page)` is the lower-level boolean check; `requireWebGL(page)`
// calls `test.skip` with a uniform reason so the CI surface is identical
// across specs.
import { test, type Page } from '@playwright/test'

export async function hasWebGL(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    try {
      const c = document.createElement('canvas')
      // `webgl` is what react-force-graph-2d / regl actually request; we keep
      // `experimental-webgl` as a permissive fallback so older stacks aren't
      // incorrectly skipped.
      const gl =
        c.getContext('webgl') ??
        (c.getContext('experimental-webgl') as WebGLRenderingContext | null)
      return gl !== null
    } catch {
      return false
    }
  })
}

export async function requireWebGL(
  page: Page,
  reason = 'WebGL context unavailable in this runner — pixel-level assertion skipped',
): Promise<void> {
  const ok = await hasWebGL(page)
  test.skip(!ok, reason)
}
