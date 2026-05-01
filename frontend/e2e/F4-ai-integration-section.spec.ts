import { expect, test } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'

// Cycle-2 docs eval C2-B2: card count was 4; the "multi-agent shared KG" pattern
// was deleted because Database::open takes a single-process exclusive write lock
// and BENCHMARKS.md row 9 calls multi-writer "single-writer-kernel-limited;
// the N=4 measurement is mechanical, not real contention". Card count is now 3.
const EXPECTED_CARD_COUNT = 3

test.describe('F4 — AI Integration section (Slice R2)', () => {
  test('section is present on landing with testid', async ({ page }) => {
    await page.goto('/')
    const section = page.locator('[data-testid="ai-integration-section"]')
    await expect(section).toBeVisible()
    await expect(section.getByRole('heading', { level: 2 })).toContainText(
      /AI integration|Wire it into your agents/i,
    )
  })

  test('renders the expected number of code blocks with non-empty <pre><code>', async ({ page }) => {
    await page.goto('/')
    const section = page.locator('[data-testid="ai-integration-section"]')
    const cards = section.locator('[data-testid="ai-pattern-card"]')
    await expect(cards).toHaveCount(EXPECTED_CARD_COUNT)

    for (let i = 0; i < EXPECTED_CARD_COUNT; i++) {
      const code = cards.nth(i).locator('pre code')
      await expect(code).toBeVisible()
      const text = (await code.innerText()).trim()
      expect(text.length, `card #${i} pre/code must not be empty`).toBeGreaterThan(20)
    }
  })

  test('each card has a Copy button that populates clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/')
    const cards = page.locator('[data-testid="ai-pattern-card"]')

    for (let i = 0; i < EXPECTED_CARD_COUNT; i++) {
      const card = cards.nth(i)
      const expected = (await card.locator('pre code').innerText()).trim()
      const copyBtn = card.getByRole('button', { name: /copy/i })
      await expect(copyBtn).toBeVisible()
      await copyBtn.click()
      const clip = (await page.evaluate(() => navigator.clipboard.readText())).trim()
      expect(clip, `card #${i} clipboard must match code`).toBe(expected)
    }
  })

  test('no code block contains consumer-chatbot phrasing', async ({ page }) => {
    await page.goto('/')
    const cards = page.locator('[data-testid="ai-pattern-card"]')
    await expect(cards).toHaveCount(EXPECTED_CARD_COUNT)

    for (let i = 0; i < EXPECTED_CARD_COUNT; i++) {
      const code = (await cards.nth(i).locator('pre code').innerText()).toLowerCase()
      expect(code, `card #${i} code must not contain "chat"`).not.toContain('chat')
      expect(code, `card #${i} code must not contain "ask your data"`).not.toContain('ask your data')
    }
  })

  // EVAL-FRONTEND-QUALITY-CYCLE3.md H-6: cycle-2 linked at
  // `/documentation/ai-integration/*.md`, which resolves to a 404 / SPA-
  // fallback because the .md files live at the repo root. Cycle-3 ships
  // an in-app `/docs/<slug>` route that lazy-loads the markdown via
  // Vite `?raw` and renders it. We pin the URL pattern AND assert a
  // real navigation produces the expected H1 — the eval explicitly
  // called out the missing click-through assertion as the reason the
  // broken link sailed through.
  test('each card links to /docs/<slug>', async ({ page }) => {
    await page.goto('/')
    const cards = page.locator('[data-testid="ai-pattern-card"]')
    await expect(cards).toHaveCount(EXPECTED_CARD_COUNT)

    for (let i = 0; i < EXPECTED_CARD_COUNT; i++) {
      const link = cards.nth(i).locator('a[href^="/docs/"]')
      await expect(link).toHaveAttribute('href', /\/docs\/[a-z0-9-]+$/)
    }
  })

  test('clicking the first pattern link navigates to a rendered doc page', async ({
    page,
  }) => {
    await page.goto('/')
    const firstLink = page
      .locator('[data-testid="ai-pattern-card"]')
      .first()
      .locator('a[href^="/docs/"]')
    const href = await firstLink.getAttribute('href')
    expect(href, 'first card must have a /docs/<slug> href').toMatch(/^\/docs\/[a-z0-9-]+$/)

    await firstLink.click()
    await expect(page).toHaveURL(new RegExp(`${href}$`))
    const article = page.locator('[data-testid="doc-page-article"]')
    await expect(article).toBeVisible()
    await expect(article.locator('h1').first()).toBeVisible()
    const h1 = (await article.locator('h1').first().innerText()).trim()
    expect(h1.length, 'doc page H1 must be non-empty').toBeGreaterThan(0)
  })

  // Cycle-2 docs eval C2-B2: the three remaining ai-integration md files were
  // redirect-stubbed (no detailed walkthrough; redirect to COOKBOOK / BENCHMARKS).
  // The "**Status:** stub — detailed walkthrough lands in a follow-up slice."
  // line was the eval's primary smoke for "was this ever fleshed out?". This
  // test asserts that smoke string never returns. (multi-agent-shared-kg.md
  // was deleted, so it's not in the list.)
  test('remaining ai-integration md files are not advertised as stubs', async () => {
    const repoRoot = path.resolve(__dirname, '..', '..')
    const targets = [
      'documentation/ai-integration/llm-to-cypher.md',
      'documentation/ai-integration/embeddings-hybrid-rrf.md',
      'documentation/ai-integration/cosmos-mcp-tool.md',
    ]
    for (const rel of targets) {
      const abs = path.join(repoRoot, rel)
      const body = await fs.readFile(abs, 'utf-8')
      expect(body, `${rel} must not advertise itself as a stub`).not.toMatch(
        /\*\*Status:\*\*\s*stub/i,
      )
    }
  })
})
