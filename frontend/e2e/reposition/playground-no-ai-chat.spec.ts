import { expect, test } from '@playwright/test'

test('playground has no AI chat affordance', async ({ page }) => {
  await page.goto('/playground')
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('button', { name: /^AI$/ })).toHaveCount(0)
  await expect(page.locator('[data-testid="ai-chat-panel"]')).toHaveCount(0)
  // Sparkles icon in the header was the AI button — should be gone
  await expect(page.locator('header svg.lucide-sparkles')).toHaveCount(0)
})
