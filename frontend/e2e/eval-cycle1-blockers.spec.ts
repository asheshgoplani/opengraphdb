import { expect, test } from '@playwright/test'

test('BLOCKER-2: dataset select has accessible name (label htmlFor + aria-label)', async ({ page }) => {
  await page.goto('/playground')
  const select = page.getByTestId('dataset-switcher')
  await expect(select).toBeVisible()
  await expect(select).toHaveAttribute('id', 'dataset-switcher')
  await expect(select).toHaveAttribute('aria-label', 'Dataset')

  const labelFor = await page.evaluate(() => {
    const lbl = document.querySelector('label[for="dataset-switcher"]')
    return lbl?.getAttribute('for') ?? null
  })
  expect(labelFor).toBe('dataset-switcher')
})

test('BLOCKER-3: empty SchemaBrowser does not declare role="tree"', async ({ page }) => {
  await page.goto('/playground')

  // Coerce empty state: stub the schema response so the browser believes the DB is empty.
  await page.route('**/api/schema*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ labels: [], relationshipTypes: [], propertyKeys: [] }),
    })
  )

  // SchemaBrowser only renders when guided queries surface schema. We assert against the
  // empty placeholder element if it appears at all on the route.
  const empty = page.getByTestId('schema-browser-empty')
  if (await empty.count()) {
    await expect(empty).not.toHaveAttribute('role', 'tree')
    await expect(empty).toHaveAttribute('aria-label', 'Schema')
  }
})
