import { expect, test } from '@playwright/test'

// R6 — cover PerfStrip testids: `perf-strip`, `perf-parse`, `perf-plan`,
// `perf-execute`, `perf-total`. The strip is one of the site's explicit
// "Verified perf" surfaces — PLAN calls it out as a keep-and-gate feature
// for the developer-first pitch ("traversals feel instant"). Without this
// spec the five testids were orphaned.

test.describe('R6 — perf strip latency cells', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')
  })

  test('renders the four latency cells with labels + awaiting-state caption', async ({ page }) => {
    const strip = page.getByTestId('perf-strip')
    await expect(strip).toBeVisible()
    await expect(strip).toHaveAttribute('aria-label', /Query performance/i)

    const parse = page.getByTestId('perf-parse')
    const plan = page.getByTestId('perf-plan')
    const execute = page.getByTestId('perf-execute')
    const total = page.getByTestId('perf-total')

    await expect(parse).toBeVisible()
    await expect(plan).toBeVisible()
    await expect(execute).toBeVisible()
    await expect(total).toBeVisible()

    // Each cell exposes its phase label (Parse / Plan / Execute / Total).
    await expect(parse).toContainText(/Parse/i)
    await expect(parse).toContainText(/µs/i)
    await expect(plan).toContainText(/Plan/i)
    await expect(plan).toContainText(/µs/i)
    await expect(execute).toContainText(/Execute/i)
    await expect(execute).toContainText(/ms/i)
    await expect(total).toContainText(/Total/i)
    await expect(total).toContainText(/ms/i)
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
