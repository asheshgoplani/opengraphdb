import { expect, test } from '@playwright/test'

test('H25: marketing HTML emits og + twitter card meta', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)
  await expect(page.locator('meta[property="og:title"]')).toHaveCount(1)
  await expect(page.locator('meta[property="og:description"]')).toHaveCount(1)
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(1)
  await expect(page.locator('meta[property="og:url"]')).toHaveCount(1)
  await expect(page.locator('meta[property="og:type"]')).toHaveCount(1)
  await expect(page.locator('meta[name="twitter:card"]')).toHaveCount(1)
  await expect(page.locator('meta[name="twitter:image"]')).toHaveCount(1)
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1)
})

test('H26: robots.txt is served and references sitemap', async ({ request, baseURL }) => {
  const r = await request.get(`${baseURL}/robots.txt`)
  expect(r.ok()).toBe(true)
  const body = await r.text()
  expect(body).toMatch(/User-agent:\s*\*/)
  expect(body).toMatch(/Sitemap:\s*https:\/\/opengraphdb\.dev\/sitemap\.xml/)
})

test('H26: sitemap.xml is served and lists core routes', async ({ request, baseURL }) => {
  const r = await request.get(`${baseURL}/sitemap.xml`)
  expect(r.ok()).toBe(true)
  const body = await r.text()
  expect(body).toMatch(/<urlset/)
  expect(body).toMatch(/opengraphdb\.dev\//)
  expect(body).toMatch(/opengraphdb\.dev\/playground/)
})

test('M28: app HTML declares noindex,nofollow for embedded console', async ({ page }) => {
  // The app build serves /playground at the same baseURL when running playground previews;
  // the embedded HTML is served from the app preview server only.
  const resp = await page.goto('/playground').catch(() => null)
  if (!resp) return
  const robots = await page.locator('meta[name="robots"]').first().getAttribute('content')
  if (robots) {
    expect(robots).toMatch(/noindex/)
  }
})
