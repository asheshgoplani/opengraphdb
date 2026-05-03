// EVAL-FRONTEND-QUALITY-CYCLE2.md H-3: cycle-1 BLOCKER-2 / BLOCKER-3 axe
// fixes were pinned by property-shape assertions only. A regression
// elsewhere — an unlabelled icon button, a low-contrast CTA, a duplicate
// id in a Dialog — would sail through. This spec runs an axe sweep over
// every public route and fails on any `critical` or `serious` finding,
// promoting axe from a one-off audit tool to a CI gate.
//
// We restrict to the WCAG 2 A/AA rule sets, since axe ships rules
// (best-practice, experimental) that are out of scope for the v0.5
// quality bar and would otherwise generate noise.

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// COVERAGE-AUDIT.md gap H16 (R4): `/docs/:slug` was missing from the
// sweep, leaving an a11y gate-skip on a public route. The DocPage
// renders a generated markdown article whose heading-rank, link-text,
// and color-contrast are all axe-checkable. We pick `llm-to-cypher`
// as the canonical slug — it's the first DOC_REGISTRY entry and is
// linked from L20 (Read the pattern) on the landing page.
const ROUTES = ['/', '/playground', '/claims', '/docs/llm-to-cypher']

async function runAxe(page: Page, path: string) {
  await page.goto(path)
  // Give Suspense fallbacks + lazy-loaded panels time to settle. Axe
  // analyses the *current* DOM, so a too-eager run can trip on the
  // brief loading shell rather than the actual page.
  await page.waitForLoadState('domcontentloaded')
  await page.waitForLoadState('networkidle').catch(() => {
    // networkidle can hang on long-poll endpoints; if it never fires
    // within the default timeout we still want to scan whatever DOM
    // we have.
  })
  const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa'])
  return builder.analyze()
}

for (const route of ROUTES) {
  test(`a11y axe sweep: ${route} — no critical or serious WCAG 2 A/AA findings`, async ({
    page,
  }) => {
    const results = await runAxe(page, route)
    const blockers = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    )
    if (blockers.length > 0) {
      const summary = blockers
        .map((v) => `  [${v.impact}] ${v.id} — ${v.help}\n    nodes: ${v.nodes.length}`)
        .join('\n')
      // Expose the first failing selector to make CI logs actionable.
      const sample = blockers[0]?.nodes[0]?.target?.[0] ?? '<no target>'
      throw new Error(
        `axe found ${blockers.length} critical/serious finding(s) on ${route}:\n${summary}\nfirst node: ${sample}`,
      )
    }
    expect(blockers).toHaveLength(0)
  })
}
