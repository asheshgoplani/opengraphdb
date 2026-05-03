// COV-H15 — Live ↔ Sample mode round-trip + state persistence.
//
// COVERAGE-AUDIT.md gap H15 (UC3):
//   "Live ↔ Sample mode round-trip + state persistence after toggle.
//    Currently asserted state-by-state; transitions not."
//
// `reposition/R6-live-connection-toggle.spec.ts` pins:
//   * Sample is pressed by default,
//   * clicking Live flips aria-pressed,
//   * the connection-badge label changes from "Sample Data" → "Live".
//
// What is NOT pinned anywhere is the *transition*:
//   * Sample → Live → Sample — does the badge round-trip correctly,
//     does the toggle revert without leaving stale state?
//   * Does the user's dataset selection (URL + selected option) survive
//     the toggle? `handleDatasetSwitch` writes searchParams; the
//     mode-change handler must NOT clear them.
//   * Does turning Live ON and OFF leave the playground in a usable
//     Sample state (no spinner stuck, no liveError banner from a
//     never-fired query)?
//
// This spec drives the round-trip end-to-end and asserts each invariant.

import { expect, test, type Page } from '@playwright/test'

async function gotoPlayground(page: Page) {
  await page.goto('/playground')
  await page.locator('canvas').first().waitFor({ state: 'visible' })
  await page.waitForLoadState('networkidle').catch(() => undefined)
}

async function clickToggle(page: Page, label: 'Sample' | 'Live') {
  await page
    .getByTestId('live-mode-toggle')
    .getByRole('button', { name: new RegExp(`^${label}$`) })
    .click()
}

test.describe('COV-H15 — Live ↔ Sample mode round-trip', () => {
  test('Sample → Live → Sample restores connection-badge + toggle pressed state', async ({
    page,
  }) => {
    await gotoPlayground(page)

    const toggle = page.getByTestId('live-mode-toggle')
    const sampleBtn = toggle.getByRole('button', { name: /^Sample$/ })
    const liveBtn = toggle.getByRole('button', { name: /^Live$/ })
    const badge = page.getByTestId('connection-badge')

    // Initial state — Sample pressed, badge says "Sample Data".
    await expect(sampleBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(liveBtn).toHaveAttribute('aria-pressed', 'false')
    await expect(badge).toContainText(/Sample Data/i)

    // Forward — Sample → Live.
    await clickToggle(page, 'Live')
    await expect(liveBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(sampleBtn).toHaveAttribute('aria-pressed', 'false')
    await expect(
      badge,
      'connection-badge label must flip to Live in live mode',
    ).toContainText(/^\s*Live/i)

    // Round-trip — Live → Sample.
    await clickToggle(page, 'Sample')
    await expect(sampleBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(liveBtn).toHaveAttribute('aria-pressed', 'false')
    await expect(
      badge,
      'connection-badge must round-trip back to Sample Data',
    ).toContainText(/Sample Data/i)
    // No stale "Live" remnant in the badge after the round-trip.
    await expect(
      badge,
      'badge must not retain the Live label after returning to Sample mode',
    ).not.toContainText(/^Live\s*$/)
  })

  test('toggling Live ↔ Sample preserves the dataset query-string + selector', async ({
    page,
  }) => {
    // Pick a non-default dataset so the URL contains a stable, observable
    // marker we can grep through the round-trip.
    await page.goto('/playground?dataset=got')
    await page.locator('canvas').first().waitFor({ state: 'visible' })

    const datasetSwitcher = page.locator('#dataset-switcher')
    await expect(datasetSwitcher).toHaveValue('got')
    await expect(page).toHaveURL(/[?&]dataset=got\b/)

    await clickToggle(page, 'Live')
    // Crucial: the mode change must NOT rewrite searchParams. The dataset
    // query-string must still be `got`, and the selector must still show
    // the same value, so a deep-link is shareable post-toggle.
    await expect(
      datasetSwitcher,
      'dataset selector must keep its value when entering live mode',
    ).toHaveValue('got')
    await expect(page).toHaveURL(/[?&]dataset=got\b/)

    await clickToggle(page, 'Sample')
    await expect(
      datasetSwitcher,
      'dataset selector must keep its value when returning to sample mode',
    ).toHaveValue('got')
    await expect(page).toHaveURL(/[?&]dataset=got\b/)
  })

  test('round-trip leaves /playground usable — no stuck spinner or live-error banner', async ({
    page,
  }) => {
    await gotoPlayground(page)

    // Drive the round-trip without ever firing a live query — handleModeChange
    // is the only state mutator we exercise. A regression that left
    // isLiveLoading=true after a back-and-forth would freeze the toggle
    // (`disabled={isLiveLoading}` on LiveModeToggle).
    await clickToggle(page, 'Live')
    await clickToggle(page, 'Sample')

    const toggle = page.getByTestId('live-mode-toggle')
    const sampleBtn = toggle.getByRole('button', { name: /^Sample$/ })
    const liveBtn = toggle.getByRole('button', { name: /^Live$/ })

    // Both buttons must remain enabled (no `disabled` attr) — proves
    // isLiveLoading was reset, not stranded.
    await expect(sampleBtn).toBeEnabled()
    await expect(liveBtn).toBeEnabled()

    // No live-error overlay must be visible — no live query was fired,
    // and toggling alone must never synthesise an error banner.
    await expect(page.getByTestId('live-error-overlay')).toHaveCount(0)
  })
})
