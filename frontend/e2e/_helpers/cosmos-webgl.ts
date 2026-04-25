import { test, type Page } from '@playwright/test'

/**
 * Detect when cosmos.gl's regl/WebGL init didn't fully succeed and skip
 * the current test instead of hard-failing. Two signals:
 *
 *   (a) The "Sorry, your device does not support the required WebGL
 *       features" fallback div is in the DOM — the simplest case.
 *   (b) The init-retry ladder has already called `clearHost()` (removing
 *       the "Sorry" fallback) and all retries failed, leaving
 *       `graphRef.current` null. In that state the WebGL canvas may still
 *       carry pixels from a partial regl render, but no `.cosmos-bloom`
 *       / `.cosmos-label` spans ever attach.
 *
 * Same pattern that premium-graph-quality.spec.ts uses; lifted into a
 * shared helper so the slice11–14 specs can self-skip on no-GPU hosts
 * (headless chromium + SwiftShader on Linux CI) instead of false-red.
 */
export async function skipIfCosmosWebglUnavailable(page: Page): Promise<void> {
  const fallbackCount = await page
    .locator('text=/Sorry.*WebGL/i')
    .count()
    .catch(() => 0)
  if (fallbackCount > 0) {
    test.skip(
      true,
      'cosmos.gl init failed — "Sorry, WebGL not supported" fallback is showing. ' +
        'Slice gates need a live WebGL context; skipping keeps the test honest as ' +
        'a regression guard on capable hosts.',
    )
  }
  const bloomAppeared = await page
    .locator('.cosmos-bloom')
    .first()
    .waitFor({ state: 'attached', timeout: 8_000 })
    .then(() => true)
    .catch(() => false)
  if (!bloomAppeared) {
    test.skip(
      true,
      'cosmos.gl init did not complete within 8 s — no `.cosmos-bloom` DOM ' +
        'overlay attached, meaning the init retry ladder exhausted without ' +
        'storing a Graph instance. Run on a real-GPU host.',
    )
  }
}
