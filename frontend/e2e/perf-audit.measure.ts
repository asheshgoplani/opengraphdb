/**
 * Perf audit measurement harness.
 * Run: BASE_URL=http://localhost:4180 npx tsx e2e/perf-audit.measure.ts
 * Emits JSON lines to stdout: {route, run, domcontent, load, lcp, tti}
 */
import { chromium, type Browser, type Page } from '@playwright/test'

const BASE = process.env.BASE_URL || 'http://localhost:4180'
const ROUTES = ['/', '/playground', '/claims']
const RUNS = Number(process.env.RUNS || 5)

// LCP must be captured with PerformanceObserver; extract it as a number.
const LCP_SCRIPT = `
  new Promise((resolve) => {
    let lcp = 0
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        lcp = Math.max(lcp, entry.startTime)
      }
    })
    po.observe({ type: 'largest-contentful-paint', buffered: true })
    // Wait a beat for LCP to stabilize after load.
    setTimeout(() => { po.disconnect(); resolve(lcp) }, 1500)
  })
`

async function measure(page: Page, route: string) {
  await page.goto('about:blank')
  const start = performance.now()
  await page.goto(BASE + route, { waitUntil: 'load' })
  const loadT = performance.now() - start
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
    return {
      dom: n.domContentLoadedEventEnd - n.startTime,
      load: n.loadEventEnd - n.startTime,
    }
  })
  const lcp = (await page.evaluate(LCP_SCRIPT)) as number
  // TTI approximation: wait for network idle, measure time since navigationStart.
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
  const tti = await page.evaluate(() => performance.now())
  return { route, dom: nav.dom, load: nav.load, lcp, tti, wall: loadT }
}

function stats(arr: number[]) {
  const s = [...arr].sort((a, b) => a - b)
  const p = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))]
  return { p50: p(0.5), p95: p(0.95), min: s[0], max: s[s.length - 1] }
}

async function main() {
  const browser: Browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--use-gl=swiftshader', '--no-sandbox'],
  })
  const results: Record<string, Array<Record<string, number | string>>> = {}
  for (const route of ROUTES) {
    results[route] = []
    for (let i = 0; i < RUNS; i++) {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      })
      const page = await ctx.newPage()
      const r = await measure(page, route)
      console.log(JSON.stringify({ run: i, ...r }))
      results[route].push(r)
      await ctx.close()
    }
  }
  await browser.close()
  console.log('\n=== SUMMARY ===')
  for (const route of ROUTES) {
    const rs = results[route]
    console.log(`${route}`)
    for (const key of ['dom', 'load', 'lcp', 'tti'] as const) {
      const s = stats(rs.map((r) => r[key] as number))
      console.log(`  ${key.padEnd(5)} p50=${s.p50.toFixed(0)}ms p95=${s.p95.toFixed(0)}ms min=${s.min.toFixed(0)} max=${s.max.toFixed(0)}`)
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
