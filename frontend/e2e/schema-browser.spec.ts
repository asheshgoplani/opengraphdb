import { expect, test } from '@playwright/test'

// RED test for PLAN slice S7: Schema / ontology browser + RDF drag-drop import.
// Expected to FAIL today — no SchemaBrowser or RDFDropzone component exists.
// Goes GREEN when slice 7 lands.

test.describe('Playground premium — S7 schema + ontology browser', () => {
  test('Wikidata dataset renders a schema tree with labels and counts', async ({ page }) => {
    await page.goto('/playground?dataset=wikidata')
    await page.waitForLoadState('networkidle')

    const tree = page.getByRole('tree', { name: /Schema/i })
    await expect(tree).toBeVisible()

    const labelsGroup = tree.getByRole('treeitem', { name: /^Labels/i })
    await expect(labelsGroup).toBeVisible()

    // Labels group is expanded by default — individual label nodes should appear with counts
    const labelNodes = tree.getByTestId('schema-label-node')
    await expect(labelNodes.first()).toBeVisible()

    await labelNodes.first().click()
    await expect(page.getByTestId('schema-property-list')).toBeVisible()
  })

  test('RDF drag-drop overlay responds to a dragenter event', async ({ page }) => {
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    // Gate on the RDFDropzone being fully mounted — its idle-phase trigger
    // button is in the DOM only after useEffect has run and attached the
    // `dragenter` listener on document.body. Without this wait, the dispatch
    // below races the effect and the overlay never appears.
    await expect(page.getByTestId('rdf-dropzone-trigger')).toBeVisible({ timeout: 10_000 })

    await page.dispatchEvent('body', 'dragenter')

    await expect(page.getByTestId('rdf-dropzone-overlay')).toBeVisible()
    await expect(page.getByText(/Drop a \.ttl file/i)).toBeVisible()
  })
})
