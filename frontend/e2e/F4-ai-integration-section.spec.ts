import { expect, test } from '@playwright/test'

test.describe('F4 — AI Integration section (Slice R2)', () => {
  test('section is present on landing with testid', async ({ page }) => {
    await page.goto('/')
    const section = page.locator('[data-testid="ai-integration-section"]')
    await expect(section).toBeVisible()
    await expect(section.getByRole('heading', { level: 2 })).toContainText(
      /AI integration|Wire it into your agents/i,
    )
  })

  test('renders 4 code blocks with non-empty <pre><code>', async ({ page }) => {
    await page.goto('/')
    const section = page.locator('[data-testid="ai-integration-section"]')
    const cards = section.locator('[data-testid="ai-pattern-card"]')
    await expect(cards).toHaveCount(4)

    for (let i = 0; i < 4; i++) {
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

    for (let i = 0; i < 4; i++) {
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
    await expect(cards).toHaveCount(4)

    for (let i = 0; i < 4; i++) {
      const code = (await cards.nth(i).locator('pre code').innerText()).toLowerCase()
      expect(code, `card #${i} code must not contain "chat"`).not.toContain('chat')
      expect(code, `card #${i} code must not contain "ask your data"`).not.toContain('ask your data')
    }
  })

  test('each card links to /docs/ai-integration/<pattern>.md', async ({ page }) => {
    await page.goto('/')
    const cards = page.locator('[data-testid="ai-pattern-card"]')
    await expect(cards).toHaveCount(4)

    for (let i = 0; i < 4; i++) {
      const link = cards.nth(i).locator('a[href*="/docs/ai-integration/"]')
      await expect(link).toHaveAttribute(
        'href',
        /\/docs\/ai-integration\/[a-z0-9-]+\.md$/,
      )
    }
  })
})
