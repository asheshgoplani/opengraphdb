// Slice S8: empty-DB first-run overlay
//
// Locks two contracts that protect the `ogdb demo` / fresh-`ogdb serve --http`
// onboarding flow from regression:
//   1. When the connected backend reports an empty schema, the playground
//      surfaces a dialog with three CTAs (import / sample query / connect).
//      Without it, a fresh user opens the playground and stares at a blank
//      canvas with no idea what to do next.
//   2. Once the schema reports any label or edge type, the dialog goes away —
//      the overlay must NEVER block a populated DB. The test re-runs the
//      schema check via a window-exposed `__refreshSchema` hook so the
//      hide-path is asserted in the same page lifetime as the show-path.
//
// `**/schema` is the real endpoint (`ApiClient.schema` GETs `/schema`,
// not `/api/schema`). Earlier drafts of the plan referenced `/api/schema`;
// the codebase doesn't have an `/api/` prefix and faking it here would not
// catch a real regression.

import { expect, test } from '@playwright/test'

test('empty DB shows overlay with three CTAs', async ({ page }) => {
  await page.route('**/schema', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ labels: [], edge_types: [], property_keys: [] }),
    }),
  )
  await page.goto('/playground')
  // PlaygroundPage is React.lazy-loaded; wait for the canvas to mount so
  // the Suspense fallback ("Loading…") is gone before we assert overlay state.
  await page.locator('canvas').first().waitFor({ state: 'visible' })

  const dialog = page.getByRole('dialog', { name: /your database is ready/i })
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: /import a dataset/i }),
  ).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: /run sample queries/i }),
  ).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: /connect to a different database/i }),
  ).toBeVisible()
})

test('overlay disappears when schema becomes non-empty', async ({ page }) => {
  let empty = true
  await page.route('**/schema', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        empty
          ? { labels: [], edge_types: [], property_keys: [] }
          : {
              labels: ['Movie'],
              edge_types: ['ACTED_IN'],
              property_keys: ['title'],
            },
      ),
    }),
  )
  await page.goto('/playground')
  await page.locator('canvas').first().waitFor({ state: 'visible' })
  await expect(
    page.getByRole('dialog', { name: /your database is ready/i }),
  ).toBeVisible()

  empty = false
  await page.evaluate(() => {
    const refresh = (window as unknown as { __refreshSchema?: () => Promise<void> })
      .__refreshSchema
    return refresh ? refresh() : Promise.resolve()
  })

  await expect(
    page.getByRole('dialog', { name: /your database is ready/i }),
  ).toBeHidden()
})
