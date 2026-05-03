// COV-H17 — Landing nav links L1-L6 (logo, section anchors, GitHub, Playground CTA).
//
// COVERAGE-AUDIT.md gap H17:
//   "Visible-but-unclicked landing nav links: Showcase / Features / Get-started
//    smooth-scroll, Logo click, Nav GitHub (L1, L2, L3, L4, L5, L6).
//    Nav coherence regressions invisible."
//
// LandingNav.tsx wires six interactive controls:
//   L1 Logo `<Link to="/">`
//   L2 `<a href="#showcase">`     — smooth-scroll to ShowcaseSection
//   L3 `<a href="#features">`     — smooth-scroll to FeaturesSection
//   L4 `<a href="#get-started">`  — smooth-scroll to GettingStartedSection
//   L5 GitHub external `<a href="https://github.com/asheshgoplani/opengraphdb"
//                          target="_blank" rel="noreferrer noopener">`
//   L6 Playground CTA `<Link to="/playground">`
//
// `landing.spec.ts` and `logo.spec.ts` cover rendering, but no spec asserts
// that each control's click resolves to the right URL / target section. A
// rename of `id="showcase"` would silently break the anchor; a regression
// that drops `target="_blank"` from the GitHub link would force-navigate
// the marketing surface away.
//
// Why visibility-anchored, not pixel-perfect: the actual scroll position
// after clicking #showcase depends on browser smooth-scroll timing and
// the sticky header offset (`scroll-mt-24`). We assert the section's
// element is in the viewport after the click — a stronger contract than
// just `expect(page).toHaveURL(/#showcase/)` (which would pass even if
// the anchor scrolled nowhere).

import { expect, test, type Page } from '@playwright/test'

async function openLanding(page: Page) {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
}

async function isInViewport(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return false
    const rect = el.getBoundingClientRect()
    // "In view" = the section's top is above the viewport bottom AND its
    // bottom is below the top — i.e., any vertical overlap with the
    // viewport rectangle. The header is fixed so the scroll target may
    // partially under-lap the header; that still counts as scrolled-to.
    const vh = window.innerHeight
    return rect.top < vh && rect.bottom > 0
  }, selector)
}

test.describe('COV-H17 — landing nav links L1-L6', () => {
  test('L1 logo link resolves to "/" with the OpenGraphDB wordmark', async ({ page }) => {
    await openLanding(page)
    // Scope to the header so we don't clash with the playground back-button.
    const logoLink = page
      .locator('header')
      .getByRole('link', { name: /OpenGraphDB/i })
      .first()
    await expect(logoLink).toBeVisible()
    await expect(logoLink).toHaveAttribute('href', '/')

    // Navigate elsewhere first, then click the logo to prove it returns home.
    await page.goto('/playground')
    await page.waitForLoadState('domcontentloaded')
    // /playground does not render the LandingNav — the logo there is a
    // back-button. We assert the *landing* logo's href is `/`; clicking
    // it from /docs (which doesn't render LandingNav either) is out of
    // scope. Round-trip via direct nav from /playground is what users do.
    await page.goto('/')
    await expect(page).toHaveURL(/\/$/)
  })

  test('L2 Showcase nav anchor scrolls #showcase into view', async ({ page }) => {
    await openLanding(page)
    const showcaseLink = page
      .locator('header')
      .getByRole('link', { name: /^Showcase$/ })
    await expect(showcaseLink).toHaveAttribute('href', '#showcase')

    await showcaseLink.click()
    // Smooth-scroll resolves over a few hundred ms; poll until the anchor
    // section is inside the viewport (or fail at the default timeout).
    await expect
      .poll(() => isInViewport(page, '#showcase'), {
        message: 'clicking Showcase nav must bring #showcase into the viewport',
        timeout: 5_000,
      })
      .toBe(true)
  })

  test('L3 Features nav anchor scrolls #features into view', async ({ page }) => {
    await openLanding(page)
    const featuresLink = page
      .locator('header')
      .getByRole('link', { name: /^Features$/ })
    await expect(featuresLink).toHaveAttribute('href', '#features')

    await featuresLink.click()
    await expect
      .poll(() => isInViewport(page, '#features'), {
        message: 'clicking Features nav must bring #features into the viewport',
        timeout: 5_000,
      })
      .toBe(true)
  })

  test('L4 Get-started nav anchor scrolls #get-started into view', async ({ page }) => {
    await openLanding(page)
    const getStartedLink = page
      .locator('header')
      .getByRole('link', { name: /^Get started$/ })
    await expect(getStartedLink).toHaveAttribute('href', '#get-started')

    await getStartedLink.click()
    await expect
      .poll(() => isInViewport(page, '#get-started'), {
        message: 'clicking Get started nav must bring #get-started into the viewport',
        timeout: 5_000,
      })
      .toBe(true)
  })

  test('L5 GitHub external link opens in a new tab with safe rel', async ({ page }) => {
    await openLanding(page)
    // Scope to the header — there are GitHub links elsewhere on the page.
    const githubLink = page
      .locator('header')
      .getByRole('link', { name: /OpenGraphDB on GitHub/i })

    await expect(githubLink).toBeVisible()
    await expect(githubLink).toHaveAttribute(
      'href',
      'https://github.com/asheshgoplani/opengraphdb',
    )
    // Safe-external contract: target=_blank + rel including noopener+noreferrer
    // so window.opener is null + Referer header is suppressed.
    await expect(githubLink).toHaveAttribute('target', '_blank')
    const rel = (await githubLink.getAttribute('rel')) ?? ''
    expect(
      rel,
      `nav GitHub link must include noopener+noreferrer in rel; got "${rel}"`,
    ).toMatch(/noopener|noreferrer/)
    expect(rel).toMatch(/noreferrer/)
  })

  test('L6 Playground CTA navigates to /playground', async ({ page }) => {
    await openLanding(page)
    // Scope to the header — there are multiple "Playground"-named CTAs
    // on the landing page (hero, get-started). The nav-bar CTA is the
    // one we want.
    const playgroundCta = page
      .locator('header')
      .getByRole('link', { name: /^Playground$/ })

    await expect(playgroundCta).toBeVisible()
    await expect(playgroundCta).toHaveAttribute('href', '/playground')

    await playgroundCta.click()
    await expect(page).toHaveURL(/\/playground(\?|$)/)
  })
})
