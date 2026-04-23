/**
 * pg-data-clarity.spec.ts — "what data am I looking at?" gate.
 *
 * Loads each dataset and asserts the dataset header strip reports node + edge
 * counts that match the dataset it claims to show, plus the dataset display
 * name and a license chip. This catches regressions where the header drifts
 * out of sync with the graph it's labelling (users were confused about what
 * was on screen before this strip existed).
 */
import { expect, test } from '@playwright/test'

const DATASETS = [
  { key: 'movielens', nameMatch: /MovieLens/i },
  { key: 'airroutes', nameMatch: /Air Routes/i },
  { key: 'got', nameMatch: /Game of Thrones/i },
  { key: 'wikidata', nameMatch: /Nobel Prize/i },
  { key: 'community', nameMatch: /Community Graph/i },
] as const

for (const { key, nameMatch } of DATASETS) {
  test(`dataset header surfaces counts + name for ${key}`, async ({ page }) => {
    await page.goto(`/playground?dataset=${key}`)
    await page.locator('canvas').first().waitFor({ state: 'visible' })

    const header = page.getByTestId('dataset-header')
    await expect(header).toBeVisible()
    await expect(header).toHaveAttribute('data-dataset-key', key)

    // Header's node/edge counts must match the sidebar stats — the same data
    // surfaced two different ways. If these drift the header is lying.
    const headerNodeCount = Number(await header.getAttribute('data-node-count'))
    const headerEdgeCount = Number(await header.getAttribute('data-edge-count'))
    expect(headerNodeCount).toBeGreaterThan(0)
    expect(headerEdgeCount).toBeGreaterThan(0)

    const footerNodeText = await page.getByTestId('footer-node-count').innerText()
    const footerEdgeText = await page.getByTestId('footer-edge-count').innerText()
    expect(Number(footerNodeText.replace(/[^\d]/g, ''))).toBe(headerNodeCount)
    expect(Number(footerEdgeText.replace(/[^\d]/g, ''))).toBe(headerEdgeCount)

    // Human-readable strip contents
    await expect(header).toContainText(
      new RegExp(`${headerNodeCount.toLocaleString()}\\s*nodes`, 'i'),
    )
    await expect(header).toContainText(
      new RegExp(`${headerEdgeCount.toLocaleString()}\\s*edges`, 'i'),
    )
    await expect(header).toContainText(nameMatch)
    // License chip must exist (any non-empty content inside the chip span).
    // We match on common license phrasing OR "Synthetic" for our own fixtures.
    await expect(header).toContainText(/(CC|Apache|MIT|Synthetic|research|public)/i)
  })
}
