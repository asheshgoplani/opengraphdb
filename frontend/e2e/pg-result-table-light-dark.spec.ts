/**
 * pg-result-table-light-dark.spec.ts — table-shaped result surfaces
 * (QueryResultTable, QueryResultSummary) must be readable in BOTH light and
 * dark themes.
 *
 * Smoke that spawned this test: rows were rendered with `text-white/85` on a
 * `bg-background/70` parent, which collapses to white-on-cream in light mode
 * (data in the DOM, but invisible to the user). Replacing those with
 * `text-foreground` / `text-muted-foreground` semantic tokens fixes both
 * themes; this test pins that fix in place.
 *
 * Strategy:
 *   - boot /playground and pick a guided query so the result-summary row
 *     ("Query returned N rows…") renders with real content.
 *   - For each theme: set the persisted Zustand setting (`ogdb-settings`),
 *     reload, assert html.classList contains the theme, then read the
 *     computed `color` of the summary text and the computed `background-color`
 *     of the page body and assert they aren't the same colour. A plain string
 *     equality check is enough — the bug class is "color === background", not
 *     a subtle contrast-ratio question.
 */
import { expect, test, type Page } from '@playwright/test'

type Theme = 'light' | 'dark'

async function setTheme(page: Page, theme: Theme): Promise<void> {
  // Persist the user's theme choice exactly the way ThemeToggle does, then
  // reload so ThemeProvider's effect runs against the stored value.
  await page.addInitScript((t) => {
    window.localStorage.setItem(
      'ogdb-settings',
      JSON.stringify({ state: { theme: t }, version: 0 }),
    )
  }, theme)
}

async function readColor(page: Page, locator: string): Promise<string> {
  return await page.locator(locator).first().evaluate((el) => {
    return window.getComputedStyle(el).color
  })
}

async function readBackground(page: Page): Promise<string> {
  return await page.evaluate(() => {
    return window.getComputedStyle(document.body).backgroundColor
  })
}

for (const theme of ['light', 'dark'] as const) {
  test(`query-result-summary rows are visible in ${theme} theme`, async ({
    page,
  }) => {
    await setTheme(page, theme)
    await page.goto('/playground?dataset=movielens')
    await page.locator('canvas').first().waitFor({ state: 'visible' })

    // Confirm the theme actually applied — guards against the test silently
    // passing because ThemeProvider regressed and never set the class.
    const htmlClass = await page.evaluate(() => document.documentElement.className)
    expect(htmlClass).toContain(theme)

    // Trigger a guided query so the summary lights up with real text + a row
    // count. The summary is always rendered (idle state too) but the "ok"
    // state is the one whose text colour we actually care about.
    const cards = page.getByTestId('query-card')
    await cards.nth(1).click()

    const summary = page.getByTestId('query-result-summary')
    await expect(summary).toBeVisible()

    // The line itself lives in a tabular-nums span — that's the element with
    // the user-facing row text. Read its computed colour.
    const textColor = await readColor(page, '[data-testid="query-result-summary"] span')
    const pageBg = await readBackground(page)

    // Hard fail: text colour and page background must not be the same string.
    // (`color === background` is the exact bug class we're guarding against.)
    expect(textColor).not.toBe(pageBg)

    // Soft sanity: the colour must not be transparent or fully alpha-zero,
    // which would also make the text invisible regardless of bg.
    expect(textColor).not.toMatch(/rgba?\(0,\s*0,\s*0,\s*0\)/)
    expect(textColor).not.toBe('transparent')
  })
}
