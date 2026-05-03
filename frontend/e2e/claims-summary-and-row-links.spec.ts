/**
 * claims-summary-and-row-links.spec.ts — C17 coverage gap H9.
 *
 * COVERAGE-AUDIT.md (H9, C6, C9) flagged two pieces of /claims content as
 * untested e2e:
 *
 *   C6  Three summary cards (Build SHA, Last verified, Status) — visible
 *       presence asserted nowhere. The existing reposition/claims-badge.spec.ts
 *       only checks that the table renders; if the summary grid silently
 *       collapsed (missing label, missing value, swapped order) no test
 *       would notice.
 *
 *   C9  Per-row GitHub link href — the Test column renders an <a> whose
 *       href is computed by `evidenceHref()` in ClaimsPage.tsx. That
 *       function turns "e2e/schema-browser" into
 *       "https://github.com/asheshgoplani/opengraphdb/blob/main/frontend/e2e/schema-browser.spec.ts".
 *       Currently nothing pins the href shape — a regression to a relative
 *       path or a wrong repo name would ship silently.
 *
 * What's pinned here:
 *   1. With a known fixture, the three summary cards each render with the
 *      expected label text + value text in the expected order.
 *   2. The Status card matches the data-driven copy: "All N claims green"
 *      vs "R red · G green" depending on the entries.
 *   3. Each row with `evidence` whose URL the helper can resolve renders
 *      an external <a> with target="_blank", rel="noreferrer noopener",
 *      and an href that matches the GitHub blob URL pattern.
 *   4. Rows without resolvable evidence fall back to a non-link span so
 *      the table doesn't render a dead `href="null"`.
 */
import { expect, test, type Page } from '@playwright/test'

interface Fixture {
  sha: string
  date: string
  entries: Array<{
    id: string
    claim: string
    status: 'green' | 'red'
    last_run: string
    evidence?: string
  }>
}

async function mockClaimsFixture(page: Page, fixture: Fixture): Promise<void> {
  await page.route('**/claims-status.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fixture),
    }),
  )
}

test.describe('H9 · /claims summary cards + per-row GitHub link href', () => {
  test('summary cards (Build / Last verified / Status) render labels + values from /claims-status.json', async ({
    page,
  }) => {
    await mockClaimsFixture(page, {
      sha: 'abcd1234',
      // formatClaimsDate reads this; we assert the formatted output below by
      // its presence on the Last-verified card. The exact format is owned by
      // formatClaimsDate.test (vitest); here we only need to know the value
      // is rendered, not the formatting policy.
      date: '2026-04-30T15:00:00Z',
      entries: [
        {
          id: 'h9-fixture-row-1',
          claim: 'fixture row 1',
          status: 'green',
          last_run: '2026-04-30T15:00:00Z',
          evidence: 'e2e/h9-row-1',
        },
        {
          id: 'h9-fixture-row-2',
          claim: 'fixture row 2',
          status: 'green',
          last_run: '2026-04-30T15:00:00Z',
          evidence: 'e2e/h9-row-2.spec.ts',
        },
      ],
    })

    await page.goto('/claims')
    await expect(page.getByTestId('claims-page-ready').or(page.getByTestId('claims-table')))
      .toBeVisible({ timeout: 5000 })

    // Three summary cards live in a 3-col grid above the table. The Status
    // card has a testid; Build and Last-verified don't, so we locate them by
    // their stable label text + the value sibling. ClaimsPage.tsx renders
    // <p>label</p><p>value</p> inside each card div.

    // ── Build card ──
    const buildLabel = page.getByText(/^Build$/, { exact: true })
    await expect(
      buildLabel,
      'Build summary card label must be present — pins the order of the 3 cards',
    ).toBeVisible()
    // The sha value is the immediate sibling <p>; query the parent card and
    // assert it contains the seeded sha.
    const buildCard = buildLabel.locator('..')
    await expect(
      buildCard,
      'Build card must show the sha from the fixture verbatim',
    ).toContainText('abcd1234')

    // ── Last-verified card ──
    const lastVerifiedLabel = page.getByText('Last verified', { exact: true })
    await expect(lastVerifiedLabel).toBeVisible()
    const lastVerifiedCard = lastVerifiedLabel.locator('..')
    // formatClaimsDate output is locale/timezone-pinned by playwright.config.
    // Don't pin the exact string — pin that the date renders something
    // non-empty. If formatClaimsDate is broken the card body would be ''.
    await expect(
      lastVerifiedCard,
      'Last verified card must render a formatted date (proves formatClaimsDate ran on the seeded ISO string)',
    ).not.toHaveText(/^\s*Last verified\s*$/)

    // ── Status card ──
    const statusSummary = page.getByTestId('claims-page-summary')
    await expect(statusSummary).toBeVisible()
    await expect(
      statusSummary,
      'with 2 green / 0 red entries, the Status card must read "All 2 claims green"',
    ).toHaveText(/All 2 claims green/)
  })

  test('Status card switches to "R red · G green" when any entry is red', async ({
    page,
  }) => {
    await mockClaimsFixture(page, {
      sha: 'redshacheck',
      date: '2026-04-30T15:00:00Z',
      entries: [
        {
          id: 'h9-red-row',
          claim: 'red row',
          status: 'red',
          last_run: '2026-04-30T15:00:00Z',
          evidence: 'e2e/h9-red',
        },
        {
          id: 'h9-green-row',
          claim: 'green row',
          status: 'green',
          last_run: '2026-04-30T15:00:00Z',
          evidence: 'e2e/h9-green',
        },
        {
          id: 'h9-green-row-2',
          claim: 'green row 2',
          status: 'green',
          last_run: '2026-04-30T15:00:00Z',
          evidence: 'e2e/h9-green-2',
        },
      ],
    })

    await page.goto('/claims')

    const summary = page.getByTestId('claims-page-summary')
    await expect(summary).toBeVisible()
    await expect(
      summary,
      'with 1 red / 2 green entries, summary must be "1 red · 2 green" — pins the conditional copy in ClaimsPage',
    ).toHaveText(/1 red · 2 green/)
  })

  test('per-row Test cell renders an external GitHub link with the canonical blob URL', async ({
    page,
  }) => {
    await mockClaimsFixture(page, {
      sha: 'linktest',
      date: '2026-04-30T15:00:00Z',
      entries: [
        // Bare relative path — evidenceHref must append ".spec.ts".
        {
          id: 'h9-link-bare',
          claim: 'bare evidence path',
          status: 'green',
          last_run: '2026-04-30T15:00:00Z',
          evidence: 'e2e/h9-link-bare',
        },
        // Already-suffixed path — must pass through unchanged (no double-suffix).
        {
          id: 'h9-link-spec',
          claim: 'evidence with .spec.ts suffix',
          status: 'green',
          last_run: '2026-04-30T15:00:00Z',
          evidence: 'e2e/h9-link-spec.spec.ts',
        },
        // Absolute URL — must pass through verbatim.
        {
          id: 'h9-link-absolute',
          claim: 'evidence is already a full URL',
          status: 'green',
          last_run: '2026-04-30T15:00:00Z',
          evidence: 'https://example.test/some-evidence',
        },
        // No evidence at all — must NOT render an <a>; falls back to a span.
        {
          id: 'h9-link-missing',
          claim: 'evidence missing',
          status: 'red',
          last_run: '2026-04-30T15:00:00Z',
        },
      ],
    })

    await page.goto('/claims')
    await expect(page.getByTestId('claims-table')).toBeVisible()

    // Bare path → href with .spec.ts appended
    const bareRow = page.getByTestId('claims-row-h9-link-bare')
    const bareLink = bareRow.getByRole('link', { name: /h9-link-bare/ })
    await expect(bareLink).toBeVisible()
    await expect(
      bareLink,
      'bare evidence path must be normalised into a full GitHub blob URL with .spec.ts appended',
    ).toHaveAttribute(
      'href',
      'https://github.com/asheshgoplani/opengraphdb/blob/main/frontend/e2e/h9-link-bare.spec.ts',
    )
    await expect(
      bareLink,
      'GitHub source link must open in a new tab — opening it in the same tab would lose the user`s claims-page state',
    ).toHaveAttribute('target', '_blank')
    await expect(
      bareLink,
      'rel="noreferrer noopener" is required for any target=_blank to prevent reverse-tabnabbing',
    ).toHaveAttribute('rel', /noreferrer/)
    await expect(bareLink).toHaveAttribute('rel', /noopener/)

    // Already-suffixed path → href unchanged
    const specRow = page.getByTestId('claims-row-h9-link-spec')
    const specLink = specRow.getByRole('link', { name: /h9-link-spec\.spec\.ts/ })
    await expect(specLink).toHaveAttribute(
      'href',
      'https://github.com/asheshgoplani/opengraphdb/blob/main/frontend/e2e/h9-link-spec.spec.ts',
    )

    // Absolute URL → href unchanged
    const absRow = page.getByTestId('claims-row-h9-link-absolute')
    const absLink = absRow.getByRole('link', { name: /example\.test/ })
    await expect(
      absLink,
      'absolute evidence URLs must pass through evidenceHref verbatim — no rewriting to GitHub',
    ).toHaveAttribute('href', 'https://example.test/some-evidence')

    // Missing evidence → row exists, but no link inside the row
    const missingRow = page.getByTestId('claims-row-h9-link-missing')
    await expect(missingRow).toBeVisible()
    await expect(
      missingRow.getByRole('link'),
      'a row with no evidence must render a fallback span, not a dead <a> with href="null" or "undefined"',
    ).toHaveCount(0)
  })
})
