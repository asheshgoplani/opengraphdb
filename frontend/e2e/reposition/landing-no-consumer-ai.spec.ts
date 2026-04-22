import { expect, test } from '@playwright/test'

test('landing has no consumer-AI phrasing', async ({ page }) => {
  await page.goto('/')
  const text = (await page.locator('main').innerText()).toLowerCase()
  for (const banned of [
    'ask your data',
    'talk to your data',
    'in plain english',
    'ai skills translate',
    'your question',
  ]) {
    expect(text, `landing must not contain "${banned}"`).not.toContain(banned)
  }
})

test('landing does not render DemoSection or HowItWorksSection', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('section#demo')).toHaveCount(1) // SampleQueryPanel keeps id="demo"
  // HowItWorksSection used to render an h2 with text "How it works"
  await expect(page.getByRole('heading', { name: /how it works/i })).toHaveCount(0)
  // DemoChatInput used a textarea; must not exist
  await expect(page.locator('[data-testid="demo-chat-input"]')).toHaveCount(0)
})
