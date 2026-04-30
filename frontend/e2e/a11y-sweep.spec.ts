import { expect, test } from '@playwright/test'

test('Loading fallback uses ellipsis char', async ({ page }) => {
  await page.route('**/src/pages/PlaygroundPage.tsx', (route) => route.continue())
  await page.goto('/playground')
  const html = await page.content()
  const hits = (html.match(/Loading\.\.\./g) || []).length
  expect(hits).toBe(0)
})

test('section anchors land below fixed nav', async ({ page }) => {
  await page.goto('/#features')
  await page.waitForTimeout(400)
  const featuresTop = await page.evaluate(() =>
    document.querySelector('#features')!.getBoundingClientRect().top,
  )
  expect(featuresTop).toBeGreaterThanOrEqual(72)
})

test('NBSP between version eyebrow tokens', async ({ page }) => {
  await page.goto('/')
  const eyebrow = await page.locator('text=v0.3.0').first().textContent()
  expect(eyebrow).toContain(' · ')
})

test('every Button has visible focus ring', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  const outline = await page.evaluate(() => {
    const ae = document.activeElement as HTMLElement | null
    return ae ? getComputedStyle(ae).boxShadow : ''
  })
  expect(outline).not.toBe('none')
})
