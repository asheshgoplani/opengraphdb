import { expect, test, type Page } from '@playwright/test'

// COVERAGE-AUDIT.md H1 — TraceControls (P24-P26 / UC17 / SB17)
//
// TraceControls renders nothing until `useGraphStore.trace` is set, and
// the playground has no UI today that seeds one (the SSE trace endpoint
// is wired backend-only). To avoid littering production code with
// test-only hooks we drive the store via Vite's dev module graph:
// `import('/src/stores/graph.ts')` returns the same module instance the
// running app imported, so calling `useGraphStore.setState({ trace })`
// from `page.evaluate` mutates the state the live <TraceControls/> is
// subscribed to.
//
// Asserts visible behaviour driven through real button clicks:
//   - speed buttons (0.5x / 1x / 2x / 5x) update `trace.speedMultiplier`
//     and the active pill carries the accent class
//   - Replay (visible only when `!isPlaying`) re-fires `setTrace`,
//     resetting `currentStepIndex` to 0 and flipping `isPlaying` true
//   - Clear nulls the trace and unmounts the strip from the DOM
//   - the percent label tracks `currentStepIndex / steps.length`

interface SeedFixture {
  isPlaying: boolean
  currentStepIndex: number
  speedMultiplier: number
  stepCount: number
}

async function seedTrace(page: Page, f: SeedFixture): Promise<void> {
  await page.evaluate(async (fixture) => {
    // Vite dev server resolves /src/* to the live module graph; the path
    // is built at runtime so TypeScript skips static resolution.
    const url = '/src/stores/graph.ts'
    const mod = (await import(/* @vite-ignore */ url)) as {
      useGraphStore: {
        setState: (partial: Record<string, unknown>) => void
      }
    }
    const steps = Array.from({ length: fixture.stepCount }, (_, i) => ({
      nodeId: `n${i}`,
      stepIndex: i,
    }))
    mod.useGraphStore.setState({
      trace: {
        isPlaying: fixture.isPlaying,
        activeNodeId: null,
        traversedNodeIds: new Set(),
        traversedEdgeIds: new Set(),
        steps,
        currentStepIndex: fixture.currentStepIndex,
        speedMultiplier: fixture.speedMultiplier,
      },
    })
  }, f)
}

interface ReadTrace {
  isPlaying: boolean
  currentStepIndex: number
  speedMultiplier: number
  stepCount: number
  isNull: boolean
}

async function readTrace(page: Page): Promise<ReadTrace> {
  return page.evaluate(async () => {
    const url = '/src/stores/graph.ts'
    const mod = (await import(/* @vite-ignore */ url)) as {
      useGraphStore: {
        getState: () => {
          trace: {
            isPlaying: boolean
            currentStepIndex: number
            speedMultiplier: number
            steps: unknown[]
          } | null
        }
      }
    }
    const t = mod.useGraphStore.getState().trace
    if (!t) {
      return {
        isPlaying: false,
        currentStepIndex: 0,
        speedMultiplier: 0,
        stepCount: 0,
        isNull: true,
      }
    }
    return {
      isPlaying: t.isPlaying,
      currentStepIndex: t.currentStepIndex,
      speedMultiplier: t.speedMultiplier,
      stepCount: t.steps.length,
      isNull: false,
    }
  })
}

test.describe('H1 — Trace controls (speed / Replay / Clear)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')
    // GraphCanvas — and therefore TraceControls — only mounts on the
    // Graph tab. Default tab is Graph; wait for the canvas marker so
    // the component is in the React tree before we seed the store.
    await expect(page.locator('[data-graph-mode]')).toBeVisible({ timeout: 10_000 })
  })

  test.afterEach(async ({ page }) => {
    // Clean up so a leaked trace from one test cannot leak into the next.
    await page
      .evaluate(async () => {
        const url = '/src/stores/graph.ts'
        const mod = (await import(/* @vite-ignore */ url)) as {
          useGraphStore: { setState: (p: Record<string, unknown>) => void }
        }
        mod.useGraphStore.setState({ trace: null })
      })
      .catch(() => {
        /* page may have been torn down already */
      })
  })

  test('Trace is hidden until seeded; appears on setTrace and the percent label is visible', async ({ page }) => {
    // Idle: no progress label.
    await expect(page.locator('text=/^\\d+%$/')).toHaveCount(0)

    await seedTrace(page, {
      isPlaying: true,
      currentStepIndex: 0,
      speedMultiplier: 1,
      stepCount: 4,
    })

    await expect(page.getByText(/^\d+%$/).first()).toBeVisible()
  })

  test('Speed buttons (0.5x / 1x / 2x / 5x) update speedMultiplier in the store', async ({ page }) => {
    await seedTrace(page, {
      isPlaying: true,
      currentStepIndex: 1,
      speedMultiplier: 1,
      stepCount: 4,
    })

    for (const speed of [0.5, 2, 5, 1] as const) {
      await page.getByRole('button', { name: `${speed}x`, exact: true }).click()
      const t = await readTrace(page)
      expect(t.speedMultiplier).toBe(speed)
    }
  })

  test('Active speed pill carries the accent class affordance', async ({ page }) => {
    await seedTrace(page, {
      isPlaying: true,
      currentStepIndex: 0,
      speedMultiplier: 1,
      stepCount: 4,
    })

    const twoX = page.getByRole('button', { name: '2x', exact: true })
    await twoX.click()
    await expect(twoX).toHaveClass(/text-accent/)

    // Sanity: the previously-active 1x is no longer accent-coloured.
    const oneX = page.getByRole('button', { name: '1x', exact: true })
    await expect(oneX).not.toHaveClass(/text-accent/)
  })

  test('Replay button shows only when paused, and re-fires setTrace from the start', async ({ page }) => {
    // Seed paused at the end (the natural state when an animation has
    // finished) so the Replay button is visible.
    await seedTrace(page, {
      isPlaying: false,
      currentStepIndex: 4,
      speedMultiplier: 0.5,
      stepCount: 4,
    })

    // When paused, the label shows "Complete" rather than a percent.
    await expect(page.getByText('Complete')).toBeVisible()

    // Sanity: Clear button is also visible (lucide-x), so we must target
    // the Replay button by its rotate-ccw icon — not by any X icon.
    const replay = page.locator('button:has(svg.lucide-rotate-ccw)')
    await expect(replay).toBeVisible()

    // Subscribe BEFORE the click so we capture the full store history —
    // useTraceAnimation will tick the index from 0 back up to stepsLen
    // and pause again, so reading state after the fact is racy. The
    // history proves setTrace fired (we saw isPlaying:true and
    // currentStepIndex:0 at least once between click and re-pause).
    await page.evaluate(async () => {
      const url = '/src/stores/graph.ts'
      const mod = (await import(/* @vite-ignore */ url)) as {
        useGraphStore: {
          subscribe: (
            cb: (s: { trace: { isPlaying: boolean; currentStepIndex: number; speedMultiplier: number } | null }) => void,
          ) => void
        }
      }
      ;(window as unknown as { __traceHistory?: unknown[] }).__traceHistory = []
      mod.useGraphStore.subscribe((s) => {
        const arr = (window as unknown as { __traceHistory: unknown[] }).__traceHistory
        if (s.trace) {
          arr.push({
            isPlaying: s.trace.isPlaying,
            currentStepIndex: s.trace.currentStepIndex,
            speedMultiplier: s.trace.speedMultiplier,
          })
        }
      })
    })

    await replay.click()

    // Wait for the animation to complete (index hits stepsLen, then a
    // separate setState pauses). useTraceAnimation pauses with
    // currentStepIndex == stepsLen, so the final history entry should be
    // { isPlaying:false, currentStepIndex:4 }.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const arr = (window as unknown as {
              __traceHistory: { isPlaying: boolean; currentStepIndex: number }[]
            }).__traceHistory
            const last = arr[arr.length - 1]
            return last && !last.isPlaying ? arr.length : 0
          }),
        { timeout: 5000 },
      )
      .toBeGreaterThan(1)

    const history = await page.evaluate(
      () =>
        (window as unknown as {
          __traceHistory: {
            isPlaying: boolean
            currentStepIndex: number
            speedMultiplier: number
          }[]
        }).__traceHistory,
    )

    // Replay re-fires setTrace, which:
    //   1. resets currentStepIndex to 0 (the history must contain a
    //      `{ currentStepIndex: 0, isPlaying: true }` snapshot),
    //   2. flips isPlaying to true at least once,
    //   3. preserves the user's chosen speedMultiplier (every snapshot
    //      keeps speed=0.5).
    expect(
      history.some((h) => h.currentStepIndex === 0 && h.isPlaying === true),
      'expected setTrace(steps, 0.5) reset to currentStepIndex:0 and isPlaying:true',
    ).toBe(true)
    expect(history.every((h) => h.speedMultiplier === 0.5)).toBe(true)

    // Replay button is gone now that the animation completed and
    // re-paused — but the controls are still mounted (Clear visible).
    await expect(page.getByText('Complete')).toBeVisible()
  })

  test('Clear button nulls the trace and unmounts the controls', async ({ page }) => {
    await seedTrace(page, {
      isPlaying: true,
      currentStepIndex: 1,
      speedMultiplier: 1,
      stepCount: 4,
    })

    await expect(page.getByText(/^\d+%$/).first()).toBeVisible()

    // Clear button — the lucide-x inside the TraceControls strip (the
    // trace strip is the only block that contains a lucide-zap label
    // icon next to a lucide-x button).
    const clear = page
      .locator('div:has(> div > svg.lucide-zap) button:has(svg.lucide-x)')
      .last()
    await clear.click()

    expect((await readTrace(page)).isNull).toBe(true)
    await expect(page.locator('text=/^\\d+%$/')).toHaveCount(0)
  })

  test('Progress bar width tracks currentStepIndex / steps.length', async ({ page }) => {
    // Seed paused so useTraceAnimation does not advance the index between
    // the seed and the assertion (the percent label is an animated
    // moving target while isPlaying is true).
    await seedTrace(page, {
      isPlaying: false,
      currentStepIndex: 2,
      speedMultiplier: 1,
      stepCount: 4,
    })

    // The inner accent bar carries the inline width style regardless of
    // isPlaying, so we can pin the math: 2 / 4 → "50%".
    const innerBar = page.locator('div.bg-muted > div.bg-accent')
    await expect(innerBar).toHaveAttribute('style', /width:\s*50%/)
  })
})
