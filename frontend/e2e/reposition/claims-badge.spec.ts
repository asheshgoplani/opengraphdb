import { expect, test } from '@playwright/test'

// F9 (reposition R4) — the ClaimsBadge is visible on landing and reflects the
// state of /claims-status.json. The landing must also render a red banner when
// any claim is red, and the /claims route must show the per-claim table.

test('ClaimsBadge is visible in the hero on /', async ({ page }) => {
  await page.goto('/')
  const badge = page.locator('[data-testid="claims-badge"]').first()
  await expect(badge).toBeVisible()
  // Ready state should resolve quickly after network idle.
  await page.waitForLoadState('networkidle')
  await expect
    .poll(() => badge.getAttribute('data-state'), { timeout: 5000 })
    .not.toBe('loading')
  const state = await badge.getAttribute('data-state')
  expect(state).toMatch(/^(green|red|unknown)$/)
})

test('ClaimsBadge is green when every entry in /claims-status.json is green', async ({
  page,
  context,
}) => {
  await context.route('**/claims-status.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sha: 'abcdef0',
        date: '2026-04-22T12:00:00Z',
        entries: [
          {
            id: 'stub-green',
            claim: 'stub claim',
            status: 'green',
            last_run: '2026-04-22T12:00:00Z',
            evidence: 'e2e/stub.spec.ts',
          },
        ],
      }),
    }),
  )
  await page.goto('/')
  const badge = page.locator('[data-testid="claims-badge"]').first()
  await expect(badge).toBeVisible()
  await expect(badge).toHaveAttribute('data-state', 'green')
  await expect(badge).toContainText(/verified/i)
  // No red banner when all green
  await expect(page.locator('[data-testid="claims-banner-red"]')).toHaveCount(0)
})

test('ClaimsBadge turns red and a banner shows when any entry is red', async ({
  page,
  context,
}) => {
  await context.route('**/claims-status.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sha: 'deadbee',
        date: '2026-04-22T12:00:00Z',
        entries: [
          {
            id: 'stub-green',
            claim: 'stub green claim',
            status: 'green',
            last_run: '2026-04-22T12:00:00Z',
            evidence: 'e2e/stub-green.spec.ts',
          },
          {
            id: 'stub-red',
            claim: 'stub red claim',
            status: 'red',
            last_run: '2026-04-22T12:00:00Z',
            evidence: 'e2e/stub-red.spec.ts',
          },
        ],
      }),
    }),
  )
  await page.goto('/')
  const badge = page.locator('[data-testid="claims-badge"]').first()
  await expect(badge).toBeVisible()
  await expect(badge).toHaveAttribute('data-state', 'red')
  await expect(badge).toContainText(/failing/i)
  await expect(page.locator('[data-testid="claims-banner-red"]')).toBeVisible()
})

test('/claims route renders the claims table with one row per entry', async ({
  page,
  context,
}) => {
  await context.route('**/claims-status.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sha: '1234567',
        date: '2026-04-22T12:00:00Z',
        entries: [
          {
            id: 'alpha',
            claim: 'alpha claim purpose',
            status: 'green',
            last_run: '2026-04-22T11:00:00Z',
            evidence: 'e2e/alpha.spec.ts',
          },
          {
            id: 'beta',
            claim: 'beta claim purpose',
            status: 'red',
            last_run: '2026-04-22T11:30:00Z',
            evidence: 'e2e/beta.spec.ts',
          },
        ],
      }),
    }),
  )
  await page.goto('/claims')
  await expect(page.locator('[data-testid="claims-table"]')).toBeVisible()
  await expect(page.locator('[data-testid="claims-row-alpha"]')).toHaveAttribute(
    'data-status',
    'green',
  )
  await expect(page.locator('[data-testid="claims-row-beta"]')).toHaveAttribute(
    'data-status',
    'red',
  )
  await expect(page.locator('[data-testid="claims-page-summary"]')).toContainText(/1 red/i)
})
