/**
 * Interaction perf measurement: measure rAF frame time while zooming the
 * playground canvas via mouse wheel. Target (R5): p95 frame time <25ms.
 *
 * Run: BASE_URL=http://localhost:4180 npx tsx e2e/perf-interaction.measure.ts
 */
import { chromium, type Page } from '@playwright/test'

const BASE = process.env.BASE_URL || 'http://localhost:4180'

async function instrumentFrames(page: Page) {
  // Pass as a string so tsx's __name transform can't touch it.
  await page.evaluate(`(() => {
    window.__frames = [];
    var last = performance.now();
    function tick() {
      var now = performance.now();
      window.__frames.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  })()`)
}

async function zoomFlurry(page: Page) {
  // Find the canvas area (cosmos renders into a child canvas inside hostRef div).
  const canvas = await page.locator('canvas').first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('no canvas')
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  // Reset frame log AFTER positioning (moves may cost frames).
  await page.evaluate(`(() => { window.__frames = [] })()`)
  // 10 wheel events, zoom in then out, 50ms apart to let rAF breathe.
  for (let i = 0; i < 10; i++) {
    const delta = i < 5 ? -160 : 160
    await page.mouse.wheel(0, delta)
    await page.waitForTimeout(50)
  }
  // Settle one more rAF cycle to catch trailing frames.
  await page.waitForTimeout(200)
  return ((await page.evaluate(`window.__frames`)) as number[]) || []
}

async function queryFirstPaint(page: Page) {
  // Find a "Run query" affordance. The Cypher editor exposes a run button;
  // fall back to a simpler approach: programmatically click any button that
  // contains "Run" text.
  const start = Date.now()
  // Just measure the time from click to the next canvas redraw.
  const runBtn = page.getByRole('button', { name: /run/i }).first()
  try { await runBtn.click({ timeout: 2000 }) } catch { return null }
  await page.waitForTimeout(300)
  return Date.now() - start
}

function stats(arr: number[]) {
  const s = [...arr].sort((a, b) => a - b)
  const p = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))]
  return { p50: p(0.5), p95: p(0.95), p99: p(0.99), max: s[s.length - 1], n: s.length }
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--use-gl=swiftshader', '--no-sandbox'],
  })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  await page.goto(BASE + '/playground', { waitUntil: 'load' })
  // Wait for a canvas to appear (cosmos mount).
  await page.waitForSelector('canvas', { timeout: 10000 })
  await page.waitForTimeout(1500) // let initial fitView settle
  await instrumentFrames(page)
  const frames = await zoomFlurry(page)
  const s = stats(frames)
  console.log(`zoom frames: n=${s.n} p50=${s.p50.toFixed(2)}ms p95=${s.p95.toFixed(2)}ms p99=${s.p99.toFixed(2)}ms max=${s.max.toFixed(2)}`)
  // also report rAF-above-25ms count
  const over25 = frames.filter((f) => f > 25).length
  console.log(`frames over 25ms: ${over25}/${s.n} (${(100 * over25 / s.n).toFixed(1)}%)`)
  const qfp = await queryFirstPaint(page)
  if (qfp !== null) console.log(`query first-paint wall: ${qfp.toFixed(0)}ms`)
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
