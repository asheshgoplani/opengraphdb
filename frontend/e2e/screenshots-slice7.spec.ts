import { test } from '@playwright/test'

test.use({ viewport: { width: 1920, height: 1080 }, colorScheme: 'dark' })

test.describe('Slice 7 screenshots', () => {
  test('schema tree populated + filter active', async ({ page }) => {
    await page.goto('/playground?dataset=wikidata')
    await page.waitForLoadState('networkidle')

    const tree = page.getByRole('tree', { name: /Schema/i })
    const labelsGroup = tree.getByRole('treeitem', { name: /^Labels/i })
    await labelsGroup.waitFor()
    await page.waitForTimeout(300)

    await page.screenshot({
      path: '/tmp/ux-slice7/01-schema-tree-populated.png',
      fullPage: false,
    })

    // Click first label to activate filter
    await tree.getByTestId('schema-label-node').first().click()
    await page.waitForTimeout(800)

    await page.screenshot({
      path: '/tmp/ux-slice7/02-filter-by-label-active.png',
      fullPage: false,
    })
  })

  test('drag-drop zone visible in idle state', async ({ page }) => {
    await page.goto('/playground?dataset=movielens')
    await page.waitForLoadState('networkidle')

    // Scroll RDF zone into view and capture sidebar
    const zone = page.getByTestId('rdf-dropzone-trigger')
    await zone.scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    await page.screenshot({
      path: '/tmp/ux-slice7/03-rdf-dropzone-idle.png',
      fullPage: false,
    })

    // Dispatch a dragenter to reveal the full-screen overlay
    await page.evaluate(() => {
      const event = new DragEvent('dragenter', {
        bubbles: true,
        cancelable: true,
        dataTransfer: new DataTransfer(),
      })
      document.body.dispatchEvent(event)
    })
    await page.waitForTimeout(400)
    await page.screenshot({
      path: '/tmp/ux-slice7/04-rdf-dropzone-overlay.png',
      fullPage: false,
    })
  })

  test('ontology mode enabled (wikidata)', async ({ page }) => {
    await page.goto('/playground?dataset=wikidata')
    await page.waitForLoadState('networkidle')

    // Click the Ontology toggle (may be disabled if no subclass edges)
    const tree = page.getByRole('tree', { name: /Schema/i })
    const ontologyBtn = tree.locator('button', { hasText: /Ontology/i }).first()
    const isDisabled = await ontologyBtn.isDisabled().catch(() => true)
    if (!isDisabled) await ontologyBtn.click()

    await page.waitForTimeout(600)
    await page.screenshot({
      path: '/tmp/ux-slice7/05-ontology-mode.png',
      fullPage: false,
    })
  })
})
