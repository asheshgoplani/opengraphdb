/**
 * pg-hover-tooltip.spec.ts — hovering a rendered node reveals a tooltip that
 * names it and lists its properties, so the user can understand each point
 * on the canvas without clicking.
 *
 * cosmos.gl picks points through a WebGL readPixels() pass which is flaky
 * under SwiftShader headless (software rasteriser). We drive the hover
 * deterministically via a test-only hook (`window.__pgHoverNodeByIndex`)
 * that calls the exact same `onNodeHover` path a real pointer-over would,
 * bypassing only the picking. This tests the UI contract we care about
 * (tooltip content for a known node) without depending on pick-buffer
 * accuracy.
 */
import { expect, test } from '@playwright/test'

test('hovering a node shows a tooltip with its label + properties', async ({ page }) => {
  // MovieLens has rich properties (title, year, etc.) so the property row
  // assertion lands on substantive content.
  await page.goto('/playground?dataset=movielens')
  await page.locator('canvas').first().waitFor({ state: 'visible' })
  // Wait for cosmos init + first render
  await page.waitForFunction(
    () => typeof (window as unknown as { __pgHoverNodeByIndex?: unknown }).__pgHoverNodeByIndex === 'function',
    null,
    { timeout: 8000 },
  )

  const tooltip = page.getByTestId('cosmos-node-tooltip')
  await expect(tooltip).toHaveAttribute('data-visible', 'false')

  // Drive hover onto the highest-degree node so the edges row has content.
  await page.evaluate(() => {
    ;(window as unknown as { __pgHoverNodeByIndex: (i: number) => void }).__pgHoverNodeByIndex(0)
  })

  await expect
    .poll(async () => (await tooltip.getAttribute('data-visible')) ?? '', { timeout: 4000 })
    .toBe('true')

  // Label non-empty
  const labelEl = tooltip.getByTestId('cosmos-node-tooltip-label')
  await expect(labelEl).toBeVisible()
  const labelText = (await labelEl.innerText()).trim()
  expect(labelText.length).toBeGreaterThan(0)

  // At least one property row — proves we're reading node.properties.
  const propertyRows = tooltip.getByTestId('cosmos-node-tooltip-property')
  await expect(propertyRows.first()).toBeVisible()
  const propCount = await propertyRows.count()
  expect(propCount).toBeGreaterThanOrEqual(1)

  // Incident-edge summary: MovieLens node 0 is typically connected, so the
  // edges row appears. If index 0 happens to be an orphan, try a few more.
  const edgesRow = tooltip.getByTestId('cosmos-node-tooltip-edges')
  if (!(await edgesRow.isVisible())) {
    for (let i = 1; i < 6; i += 1) {
      await page.evaluate((idx) => {
        ;(window as unknown as { __pgHoverNodeByIndex: (n: number) => void }).__pgHoverNodeByIndex(idx)
      }, i)
      if (await edgesRow.isVisible()) break
    }
  }
  await expect(edgesRow).toBeVisible()
  // Edge row names at least one edge type (e.g. ACTED_IN, RATED, IN_GENRE)
  await expect(edgesRow).toContainText(/[A-Z_]{2,}/)
})

test('clearing hover hides the tooltip', async ({ page }) => {
  await page.goto('/playground?dataset=movielens')
  await page.locator('canvas').first().waitFor({ state: 'visible' })
  await page.waitForFunction(
    () => typeof (window as unknown as { __pgHoverNodeByIndex?: unknown }).__pgHoverNodeByIndex === 'function',
    null,
    { timeout: 8000 },
  )

  const tooltip = page.getByTestId('cosmos-node-tooltip')
  await page.evaluate(() => {
    ;(window as unknown as { __pgHoverNodeByIndex: (i: number) => void }).__pgHoverNodeByIndex(0)
  })
  await expect
    .poll(async () => (await tooltip.getAttribute('data-visible')) ?? '', { timeout: 4000 })
    .toBe('true')

  await page.evaluate(() => {
    ;(window as unknown as { __pgHoverClear: () => void }).__pgHoverClear()
  })
  await expect
    .poll(async () => (await tooltip.getAttribute('data-visible')) ?? '', { timeout: 4000 })
    .toBe('false')
})
