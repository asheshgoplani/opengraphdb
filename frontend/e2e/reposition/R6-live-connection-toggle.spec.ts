import { expect, test } from '@playwright/test'

// R6 — cover `live-mode-toggle` + `connection-badge` (and their inner Sample/Live
// buttons). Both surface the Sample↔Live-backend switch, which is a core
// developer-first claim on /playground; pre-R6 neither had a spec referencing
// its testid, so feature-inventory flagged both as orphans.

test.describe('R6 — live-mode toggle + connection badge', () => {
  test('`live-mode-toggle` is visible with Sample / Live pressed states', async ({ page }) => {
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    const toggle = page.getByTestId('live-mode-toggle')
    await expect(toggle).toBeVisible()

    const sampleBtn = toggle.getByRole('button', { name: /^Sample$/ })
    const liveBtn = toggle.getByRole('button', { name: /^Live$/ })
    await expect(sampleBtn).toBeVisible()
    await expect(liveBtn).toBeVisible()

    // Default state: Sample is pressed, Live is not.
    await expect(sampleBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(liveBtn).toHaveAttribute('aria-pressed', 'false')

    // Clicking Live flips the pressed state without needing a backend — the
    // playground page only fires live queries when a guided query runs in
    // live mode, not on the toggle itself.
    await liveBtn.click()
    await expect(liveBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(sampleBtn).toHaveAttribute('aria-pressed', 'false')

    await sampleBtn.click()
    await expect(sampleBtn).toHaveAttribute('aria-pressed', 'true')
  })

  test('`connection-badge` renders Sample Data state with in-memory query time', async ({
    page,
  }) => {
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    const badge = page.getByTestId('connection-badge')
    await expect(badge).toBeVisible()
    await expect(badge).toContainText(/Sample Data/i)
    // In-memory latency is the Sample-mode annotation; we don't assert the
    // exact number, just the suffix that distinguishes it from Live.
    await expect(badge).toContainText(/in-memory/i)
  })

  test('`connection-badge` flips to `Live` label when toggled into live mode', async ({
    page,
  }) => {
    await page.goto('/playground')
    await page.waitForLoadState('networkidle')

    const toggle = page.getByTestId('live-mode-toggle')
    await toggle.getByRole('button', { name: /^Live$/ }).click()

    const badge = page.getByTestId('connection-badge')
    await expect(badge).toBeVisible()
    // When isLive=true and no error, the badge label switches to "Live".
    await expect(badge).toContainText(/^\s*Live/i)
  })
})
