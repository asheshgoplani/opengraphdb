import { expect, test } from '@playwright/test'

// R6 — cover PerfStrip testids: `perf-strip`, `perf-rows`, `perf-nodes`,
// `perf-edges`, `perf-total`. The strip used to expose synthesized
// parse/plan/execute cells computed as fixed 5/20/75% ratios of the total
// query time — labelled "Verified perf · live · profiled" while the backend
// did not in fact return a profile. After the C9 audit (2026-05-02) the four
// cells are real counters; this spec is the regression guard against the
// fakery returning.

test.describe('R6 — perf strip cells (post-C9 audit)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')
  })

  test('renders the four real-counter cells with labels + awaiting-state caption', async ({ page }) => {
    const strip = page.getByTestId('perf-strip')
    await expect(strip).toBeVisible()
    await expect(strip).toHaveAttribute('aria-label', /Query performance/i)

    const rows = page.getByTestId('perf-rows')
    const nodes = page.getByTestId('perf-nodes')
    const edges = page.getByTestId('perf-edges')
    const total = page.getByTestId('perf-total')

    await expect(rows).toBeVisible()
    await expect(nodes).toBeVisible()
    await expect(edges).toBeVisible()
    await expect(total).toBeVisible()

    await expect(rows).toContainText(/Rows/i)
    await expect(nodes).toContainText(/Nodes/i)
    await expect(edges).toContainText(/Edges/i)
    await expect(total).toContainText(/Total/i)
    await expect(total).toContainText(/ms/i)

    // The header copy must NOT claim verified profiling — the C9 audit found
    // the strip was advertising a profile it did not actually have. Both the
    // "Verified perf" superlative and the "profiled" subtitle have to stay
    // gone until backend exposes db.query_profiled.
    await expect(strip).not.toContainText(/verified perf/i)
    await expect(strip).not.toContainText(/profiled/i)
  })

  test('running a guided query populates the Total cell with a measured value', async ({
    page,
  }) => {
    const total = page.getByTestId('perf-total')
    await expect(total).toContainText('—') // awaiting first query

    // Click a guided query — sample-mode runs fully in the browser, so no
    // backend is required. The perf strip should surface a numeric value.
    const firstCard = page.getByTestId('query-card').first()
    await firstCard.click()

    await expect(async () => {
      const text = (await total.innerText()).trim()
      expect(text).not.toContain('—')
      // Match a number (maybe with decimals) followed by `ms`.
      expect(text).toMatch(/\d+(?:\.\d+)?\s*ms/i)
    }).toPass({ timeout: 3000 })
  })
})
