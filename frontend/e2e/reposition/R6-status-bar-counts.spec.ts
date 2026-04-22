import { expect, test } from '@playwright/test'

// R6 — cover `footer-node-count` + `footer-edge-count` testids. The status
// bar itself (`status-bar`) was already covered by polish-cohesion.spec.ts,
// but the per-metric counter testids had no referencing spec.

test.describe('R6 — status bar node/edge counters', () => {
  test('footer counts reflect the movielens sample dataset', async ({ page }) => {
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    const nodeCount = page.getByTestId('footer-node-count')
    const edgeCount = page.getByTestId('footer-edge-count')

    await expect(nodeCount).toBeVisible()
    await expect(edgeCount).toBeVisible()

    const n = parseInt((await nodeCount.innerText()).trim(), 10)
    const e = parseInt((await edgeCount.innerText()).trim(), 10)
    expect(n).toBeGreaterThan(0)
    expect(e).toBeGreaterThan(0)
  })

  test('footer counts update when switching to a different dataset', async ({ page }) => {
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    const nodeCount = page.getByTestId('footer-node-count')
    const initial = (await nodeCount.innerText()).trim()

    await page.getByTestId('dataset-switcher').first().selectOption('airroutes')
    await page.waitForLoadState('networkidle')

    await expect(async () => {
      const next = (await nodeCount.innerText()).trim()
      expect(next).not.toBe(initial)
    }).toPass({ timeout: 3000 })
  })
})
