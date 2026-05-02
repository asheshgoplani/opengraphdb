/**
 * c9-playground-values.spec.ts — C9 audit (2026-05-02) regression guard.
 *
 * Asserts every visible number in the playground (PerfStrip cells, dataset
 * header counts, dataset description, footer counters) maps to a real
 * computed truth, not a synthesized ratio or stale hand-typed claim.
 *
 * Concrete invariants this guards:
 *   1. PerfStrip cells (Rows / Nodes / Edges / Total) read from real state.
 *   2. PerfStrip header does NOT advertise "Verified perf" or "profiled" —
 *      the previous parse/plan/execute split was 5/20/75% of total, fake.
 *   3. The MovieLens sample fixture really has 69 nodes / 60 edges
 *      (60 Movie + 9 Genre + 60 IN_GENRE), and the dataset description
 *      surfaces those exact numbers (it is template-substituted at build).
 *   4. Footer nodes/edges == DatasetHeader nodes/edges == fixture totals.
 */
import { expect, test } from '@playwright/test'

// Verified by counting the fixture file: see
// frontend/src/data/movieLensGraph.ts (60 movie seeds + 9 genre seeds, one
// IN_GENRE edge per movie).
const MOVIELENS_FIXTURE = {
  totalNodes: 69,
  movies: 60,
  genres: 9,
  edges: 60,
}

test.describe('C9 — playground displayed values are real', () => {
  test('MovieLens sample dataset shows exactly 69 nodes / 60 edges (60 movies, 9 genres)', async ({
    page,
  }) => {
    await page.goto('/playground?dataset=movielens')
    await page.locator('canvas').first().waitFor({ state: 'visible' })

    // 1. DatasetHeader data-* attributes must match the fixture totals.
    const header = page.getByTestId('dataset-header')
    await expect(header).toBeVisible()
    await expect(header).toHaveAttribute('data-dataset-key', 'movielens')
    expect(Number(await header.getAttribute('data-node-count'))).toBe(
      MOVIELENS_FIXTURE.totalNodes,
    )
    expect(Number(await header.getAttribute('data-edge-count'))).toBe(
      MOVIELENS_FIXTURE.edges,
    )

    // 2. Footer counters must agree with the header (same source).
    const footerNodes = await page.getByTestId('footer-node-count').innerText()
    const footerEdges = await page.getByTestId('footer-edge-count').innerText()
    expect(Number(footerNodes.replace(/[^\d]/g, ''))).toBe(MOVIELENS_FIXTURE.totalNodes)
    expect(Number(footerEdges.replace(/[^\d]/g, ''))).toBe(MOVIELENS_FIXTURE.edges)

    // 3. The DatasetSwitcher description renders the exact fixture totals
    //    (template-substituted from the SAMPLE constant — guards against
    //    re-introduction of hand-typed "20 movies / 10 genres / ~80 edges"
    //    style copy that user QA flagged as not matching the real fixture).
    const switcher = page.getByTestId('dataset-switcher').locator('xpath=..')
    await expect(switcher).toContainText(
      new RegExp(`${MOVIELENS_FIXTURE.totalNodes}\\s*nodes`),
    )
    await expect(switcher).toContainText(
      new RegExp(`${MOVIELENS_FIXTURE.edges}\\s*edges`),
    )
    // Movie + Genre is the label-set claim; if we ever drop one, this
    // catches the description drifting away.
    await expect(switcher).toContainText(/Movie\s*\+\s*Genre/)
  })

  test('PerfStrip cells reflect real counters (no synthesized parse/plan/execute)', async ({
    page,
  }) => {
    await page.goto('/playground?dataset=movielens')
    await page.locator('canvas').first().waitFor({ state: 'visible' })

    const strip = page.getByTestId('perf-strip')
    await expect(strip).toBeVisible()

    // The C9 audit removed the four phase-timing cells and the misleading
    // "Verified perf · profiled" subtitle. Both must stay gone.
    await expect(strip).not.toContainText(/verified perf/i)
    await expect(strip).not.toContainText(/profiled/i)
    // No micro-second µs cells either — those were the synthesized
    // parse/plan splits (5%/20% of total). Their absence is the regression
    // guard against the breakdown() helper sneaking back in.
    await expect(strip).not.toContainText(/µs/i)

    // Run a sample-mode query so PerfStrip has data to display.
    const firstCard = page.getByTestId('query-card').first()
    await firstCard.click()

    // Total cell must show a finite ms reading (real wall-clock).
    const total = page.getByTestId('perf-total')
    await expect(async () => {
      const text = (await total.innerText()).trim()
      expect(text).not.toContain('—')
      expect(text).toMatch(/\d+(?:\.\d+)?\s*ms/i)
    }).toPass({ timeout: 3000 })

    // Nodes/Edges cells must report the same numbers the canvas + footer
    // are using — i.e. the visible graph, not a hard-coded fixture string.
    const nodesCell = page.getByTestId('perf-nodes')
    const edgesCell = page.getByTestId('perf-edges')

    const footerNodes = Number(
      (await page.getByTestId('footer-node-count').innerText()).replace(/[^\d]/g, ''),
    )
    const footerEdges = Number(
      (await page.getByTestId('footer-edge-count').innerText()).replace(/[^\d]/g, ''),
    )

    // The "all" guided query restores the full sample, so PerfStrip should
    // mirror the dataset totals once the click settles.
    await expect(async () => {
      const nodesText = (await nodesCell.innerText()).trim()
      const edgesText = (await edgesCell.innerText()).trim()
      const nodesValue = Number(nodesText.replace(/[^\d]/g, '').match(/\d+/)?.[0] ?? '0')
      const edgesValue = Number(edgesText.replace(/[^\d]/g, '').match(/\d+/)?.[0] ?? '0')
      expect(nodesValue).toBe(footerNodes)
      expect(edgesValue).toBe(footerEdges)
    }).toPass({ timeout: 3000 })

    // Rows cell must have a concrete number after the query runs (the
    // active card's resultCount, sample mode).
    const rowsCell = page.getByTestId('perf-rows')
    await expect(async () => {
      const text = (await rowsCell.innerText()).trim()
      expect(text).not.toContain('—')
      expect(text).toMatch(/\d/)
    }).toPass({ timeout: 3000 })
  })

  test('PerfStrip header copy is honest about the data source', async ({ page }) => {
    await page.goto('/playground?dataset=movielens')
    await page.locator('canvas').first().waitFor({ state: 'visible' })

    const strip = page.getByTestId('perf-strip')
    // The header claims "Last query · measured locally · sample · in-memory
    // filter" in sample mode. The previous wording falsely said "Verified
    // perf · live · profiled" — the C9 audit caught that the backend never
    // returned a profile so neither superlative was true.
    await expect(strip).toContainText(/last query/i)
    await expect(strip).toContainText(/sample|live/i)
    await expect(strip).toContainText(/in-memory|http/i)
  })
})
