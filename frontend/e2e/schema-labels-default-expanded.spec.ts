import { expect, test } from '@playwright/test'

// Regression: SchemaBrowser "Labels" section must be expanded on first render
// so the left rail doesn't look empty. (Audit issue #5: UX — Labels tree
// defaulted to collapsed, schema browser appeared blank on dataset load.)

test.describe('SchemaBrowser labels default-expanded', () => {
  test('Labels treeitem is aria-expanded=true on initial render', async ({ page }) => {
    await page.goto('/playground?dataset=wikidata')
    await page.waitForLoadState('networkidle')

    const tree = page.getByRole('tree', { name: /Schema/i })
    await expect(tree).toBeVisible()

    const labelsGroup = tree.getByRole('treeitem', { name: /^Labels/i })
    await expect(labelsGroup).toBeVisible()
    await expect(labelsGroup).toHaveAttribute('aria-expanded', 'true')

    // And the individual label nodes must be visible without any user click.
    const labelNodes = tree.getByTestId('schema-label-node')
    await expect(labelNodes.first()).toBeVisible()
  })

  test('Labels can still be collapsed by clicking', async ({ page }) => {
    await page.goto('/playground?dataset=wikidata')
    await page.waitForLoadState('networkidle')

    const tree = page.getByRole('tree', { name: /Schema/i })
    const labelsGroup = tree.getByRole('treeitem', { name: /^Labels/i })
    await expect(labelsGroup).toHaveAttribute('aria-expanded', 'true')

    await labelsGroup.click()
    await expect(labelsGroup).toHaveAttribute('aria-expanded', 'false')
  })
})
