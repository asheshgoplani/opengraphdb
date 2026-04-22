/**
 * R5 — perf-smooth gate. User report: "when I zoom in/out the text seems to
 * move slowly, knowledge graph laggy and not smooth" on real-GPU Mac.
 *
 * This spec:
 *  1. Loads /playground?dataset=movielens (the dataset the user was on).
 *  2. Lets cosmos settle its initial fit + simulation.
 *  3. Starts a rAF frame-time sampler in the browser.
 *  4. Dispatches 5 zoom-in wheel events, waits 250 ms between, then 5
 *     zoom-out wheel events at 250 ms spacing (user gesture pattern).
 *  5. Collects frame deltas, computes p50/p95/max/over-budget counts, and
 *     asserts: p95 ≤ 25 ms (40 fps floor) AND no single frame > 100 ms
 *     (no hitches), AND label DOM count is stable across zoom (no leak).
 *
 * Output: JSON line in test stdout so CI can regression-track p95 over
 * time, and a sidecar JSON in test-results/ so humans can open it locally.
 */

import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

interface PerfSample {
  frames: number
  p50: number
  p95: number
  p99: number
  max: number
  over25: number
  over50: number
  over100: number
  labelsBefore: number
  labelsAfter: number
  bloomsBefore: number
  bloomsAfter: number
  durationMs: number
}

test.describe('R5 — zoom perf gate', () => {
  test('zoom-in ×5 + zoom-out ×5 on MovieLens stays smooth', async ({ page }) => {
    test.setTimeout(60_000)

    await page.goto('/playground?dataset=movielens')
    await page.waitForLoadState('networkidle')

    // Wait for the WebGL canvas to attach AND for labels to actually paint.
    // On SwiftShader-headless, cosmos sometimes fails regl init entirely and
    // falls back to "Sorry, …"; if we only wait on canvas attachment, we can
    // sample an empty frame stream. The label count check catches that.
    const canvas = page.locator('canvas').first()
    await canvas.waitFor({ state: 'attached', timeout: 10_000 })

    // Give cosmos's init-retry ladder (delays 16/80/250/500/900/1400 ms) AND
    // staggered fitView (fires at 16, 600, 1500, 2600 ms after init) time to
    // land. Sampling before blooms attach gives bogus numbers.
    //
    // IMPORTANT: headless-chromium under SwiftShader can legitimately fail
    // regl init on large datasets; in that environment cosmos shows a
    // "Sorry, your device does not support …" fallback and never attaches
    // blooms/labels. The user's perf issue manifests on a real-GPU Mac where
    // cosmos DOES init, so we only meaningfully run the probe in that case.
    // When cosmos doesn't init we skip with a clear reason — the gate is
    // still a regression guard on environments where WebGL works (which
    // includes the user's Mac and any CI runner with a real GPU).
    const hasCosmosFallback = await page
      .locator('text=/Sorry.*WebGL/i')
      .count()
      .catch(() => 0)
    if (hasCosmosFallback > 0) {
      test.skip(
        true,
        'cosmos.gl could not init WebGL in this headless/SwiftShader env ' +
          '(fallback "Sorry, …" message is showing). The perf fix being ' +
          'guarded cannot manifest without a live rAF frame loop, so this ' +
          'env cannot observe the bug either way. Run on a real-GPU host.',
      )
    }

    await page.locator('.cosmos-bloom').first().waitFor({ state: 'attached', timeout: 15_000 })
    await page.waitForTimeout(2_500)

    const labelsBefore = await page.locator('.cosmos-label').count()
    const bloomsBefore = await page.locator('.cosmos-bloom').count()

    const sample: PerfSample = await page.evaluate(async () => {
      const canvasEl = document.querySelector('canvas') as HTMLCanvasElement
      const rect = canvasEl.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2

      const frames: number[] = []
      let last = performance.now()
      let running = true
      const start = performance.now()

      const tick = (now: number) => {
        if (!running) return
        frames.push(now - last)
        last = now
        requestAnimationFrame(tick)
      }
      last = performance.now()
      requestAnimationFrame(tick)

      const wheel = (deltaY: number) => {
        // Cosmos listens to wheel on the canvas via d3-zoom; d3-zoom keys on
        // `ctrlKey` for pinch-zoom but plain deltaY is the normal scroll-zoom
        // path for mice. Both trigger the same zoom handler.
        const ev = new WheelEvent('wheel', {
          deltaY,
          clientX: cx,
          clientY: cy,
          bubbles: true,
          cancelable: true,
        })
        canvasEl.dispatchEvent(ev)
      }

      // Let the sampler capture a baseline before firing events.
      await new Promise((r) => setTimeout(r, 300))

      // 5× zoom-in at 250 ms spacing.
      for (let i = 0; i < 5; i += 1) {
        wheel(-120)
        await new Promise((r) => setTimeout(r, 250))
      }

      // 5× zoom-out at 250 ms spacing.
      for (let i = 0; i < 5; i += 1) {
        wheel(120)
        await new Promise((r) => setTimeout(r, 250))
      }

      // Let the last wheel event's effect flush.
      await new Promise((r) => setTimeout(r, 500))
      running = false

      const durationMs = performance.now() - start

      const sorted = [...frames].sort((a, b) => a - b)
      const pct = (p: number) =>
        sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]

      const labelsAfter = document.querySelectorAll('.cosmos-label').length
      const bloomsAfter = document.querySelectorAll('.cosmos-bloom').length

      return {
        frames: frames.length,
        p50: pct(0.5),
        p95: pct(0.95),
        p99: pct(0.99),
        max: sorted[sorted.length - 1] ?? 0,
        over25: frames.filter((d) => d > 25).length,
        over50: frames.filter((d) => d > 50).length,
        over100: frames.filter((d) => d > 100).length,
        labelsBefore: 0,
        labelsAfter,
        bloomsBefore: 0,
        bloomsAfter,
        durationMs,
      }
    })
    sample.labelsBefore = labelsBefore
    sample.bloomsBefore = bloomsBefore

    // Persist to test-results for regression tracking.
    const outPath = join(
      process.cwd(),
      'test-results',
      'r5-perf-smooth',
      'sample.json',
    )
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, JSON.stringify(sample, null, 2))

    // Stdout line for humans / CI log grep.
    // eslint-disable-next-line no-console
    console.log(
      `[R5-perf] frames=${sample.frames} p50=${sample.p50.toFixed(1)}ms ` +
        `p95=${sample.p95.toFixed(1)}ms p99=${sample.p99.toFixed(1)}ms ` +
        `max=${sample.max.toFixed(1)}ms over25=${sample.over25} ` +
        `over50=${sample.over50} over100=${sample.over100} ` +
        `labels=${sample.labelsBefore}→${sample.labelsAfter} ` +
        `blooms=${sample.bloomsBefore}→${sample.bloomsAfter}`,
    )

    // Gate 1: p95 ≤ 25 ms (40 fps floor). Under SwiftShader-headless the
    // WebGL compositor is software so we expect worse absolute perf than a
    // real-GPU Mac — if this passes here, it will also pass for the user.
    expect(
      sample.p95,
      `p95 frame time ${sample.p95.toFixed(1)} ms exceeds 25 ms budget ` +
        `(frames=${sample.frames}, max=${sample.max.toFixed(1)} ms)`,
    ).toBeLessThanOrEqual(25)

    // Gate 2: zero hitches > 100 ms. A single 100 ms frame during zoom is a
    // visible stutter that the user will notice.
    expect(
      sample.over100,
      `${sample.over100} frames exceeded 100 ms (max=${sample.max.toFixed(1)} ms)`,
    ).toBe(0)

    // Gate 3: label/bloom DOM count must be stable across zoom — within a
    // small delta that allows for the zoom-LOD to fade a handful of labels
    // in/out. A big delta means we're leaking DOM nodes (old code kept
    // appending labels because the whole render body re-ran every frame).
    expect(
      Math.abs(sample.labelsAfter - sample.labelsBefore),
      `label DOM count drifted ${sample.labelsBefore} → ${sample.labelsAfter}`,
    ).toBeLessThanOrEqual(4)
    expect(
      Math.abs(sample.bloomsAfter - sample.bloomsBefore),
      `bloom DOM count drifted ${sample.bloomsBefore} → ${sample.bloomsAfter}`,
    ).toBeLessThanOrEqual(2)
  })
})
