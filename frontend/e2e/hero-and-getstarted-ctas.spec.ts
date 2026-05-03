import { expect, test } from '@playwright/test'

// COVERAGE-AUDIT.md H3 — Conversion-critical CTAs lack click-through
// assertions (L8 hero "Open the playground", L9 hero "View on GitHub",
// L17 get-started "Open the playground").
//
// `landing.spec.ts` covers the showcase cards and the nav-level
// `header a[href="/playground"]` link, but the two hero buttons and the
// secondary "Open the playground" button at the foot of the get-started
// section have no test today. Breaking either silently regresses the
// landing → playground funnel.
//
// Asserts:
//   - the hero "Open the playground" link navigates to /playground
//   - the hero "View on GitHub" link points at the canonical repo with
//     target=_blank and a noreferrer-class rel attribute
//   - the get-started "Open the playground" link is the last visible
//     entry-point on the page and also navigates to /playground (to
//     prove it isn't a false duplicate of the nav CTA)

test.describe('H3 — Landing CTAs (hero + get-started)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('Hero "Open the playground" CTA navigates to /playground', async ({ page }) => {
    const heroSection = page.locator('section[aria-labelledby="hero-heading"]')
    await expect(heroSection).toBeVisible()

    const heroCta = heroSection.getByRole('link', { name: /open the playground/i })
    await expect(heroCta).toBeVisible()
    await expect(heroCta).toHaveAttribute('href', '/playground')

    await heroCta.click()
    await expect(page).toHaveURL(/\/playground$/)
  })

  test('Hero "View on GitHub" link points at the repo with target=_blank + safe rel', async ({ page }) => {
    const heroSection = page.locator('section[aria-labelledby="hero-heading"]')
    const ghLink = heroSection.getByRole('link', { name: /view on github/i })
    await expect(ghLink).toBeVisible()

    const href = await ghLink.getAttribute('href')
    expect(href).toMatch(/^https:\/\/github\.com\/[^/]+\/opengraphdb/)

    await expect(ghLink).toHaveAttribute('target', '_blank')
    // `rel` should include noreferrer (and ideally noopener) — guards
    // against tabnabbing on cross-origin window.opener access.
    const rel = (await ghLink.getAttribute('rel')) ?? ''
    expect(rel).toMatch(/noreferrer/)
  })

  test('Get-started "Open the playground" CTA is distinct from the nav CTA and navigates to /playground', async ({ page }) => {
    const getStarted = page.locator('#get-started')
    await getStarted.scrollIntoViewIfNeeded()
    await expect(getStarted).toBeVisible()

    const getStartedCta = getStarted.getByRole('link', { name: /open the playground/i })
    await expect(getStartedCta).toBeVisible()
    await expect(getStartedCta).toHaveAttribute('href', '/playground')

    // Sanity: there are exactly two "Open the playground" links on the
    // page — hero and get-started. The nav uses a shorter "Playground"
    // label, so a regression that collapses get-started into the nav
    // CTA (or that swaps its label to "Playground") would drop us to
    // one match here and fail.
    const allCtas = page.getByRole('link', { name: /open the playground/i })
    expect(await allCtas.count()).toBe(2)
    // And the nav CTA still exists with its shorter label.
    await expect(page.locator('header').getByRole('link', { name: 'Playground' })).toBeVisible()

    await getStartedCta.click()
    await expect(page).toHaveURL(/\/playground$/)
  })
})
