// EVAL-FRONTEND-QUALITY-CYCLE2.md BLOCKER-3: index-marketing.html references
// `https://opengraphdb.dev/og-card.png` from three OG/Twitter meta tags. The
// file must exist in `frontend/public/` (so `npm run build:marketing`
// publishes it), and it must be 1200×630 — every social platform that
// renders the card uses that aspect ratio.
//
// Pin both the existence and the dimensions so a missing or accidentally-
// resized PNG fails CI rather than producing a broken share preview at
// launch time.

import * as assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const compiledDir = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(compiledDir, '..', '..')
const ogCardPath = resolve(frontendRoot, 'public', 'og-card.png')
const marketingHtmlPath = resolve(frontendRoot, 'index-marketing.html')

// Read PNG width + height from the IHDR chunk. PNG layout:
//   [0..7]   signature: 89 50 4E 47 0D 0A 1A 0A
//   [8..11]  IHDR length (4 bytes)
//   [12..15] "IHDR"
//   [16..19] width (big-endian u32)
//   [20..23] height (big-endian u32)
function readPngDimensions(path: string): { width: number; height: number } {
  const bytes = readFileSync(path)
  if (bytes.length < 24) {
    throw new Error(`png too short: ${path} (${bytes.length} bytes)`)
  }
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== signature[i]) {
      throw new Error(`not a PNG: ${path}`)
    }
  }
  const ihdr = bytes.subarray(12, 16).toString('ascii')
  if (ihdr !== 'IHDR') {
    throw new Error(`expected IHDR, got ${ihdr}: ${path}`)
  }
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  return { width, height }
}

test('og-card.png exists in frontend/public/', () => {
  assert.ok(
    existsSync(ogCardPath),
    `expected social share image at ${ogCardPath} (referenced by index-marketing.html og:image / twitter:image)`,
  )
})

test('og-card.png is 1200×630 (Open Graph + Twitter aspect)', () => {
  const { width, height } = readPngDimensions(ogCardPath)
  assert.equal(width, 1200, `og-card.png width must be 1200, got ${width}`)
  assert.equal(height, 630, `og-card.png height must be 630, got ${height}`)
})

test('index-marketing.html still references og-card.png from og:image and twitter:image', () => {
  const html = readFileSync(marketingHtmlPath, 'utf8')
  const ogImage = /<meta\s+property="og:image"\s+content="([^"]+)"/.exec(html)
  const twitterImage = /<meta\s+name="twitter:image"\s+content="([^"]+)"/.exec(html)
  assert.ok(ogImage, 'og:image meta tag must be present')
  assert.ok(twitterImage, 'twitter:image meta tag must be present')
  const ogImageHref = ogImage[1] ?? ''
  const twitterImageHref = twitterImage[1] ?? ''
  assert.match(
    ogImageHref,
    /og-card\.png(?:$|\?)/,
    `og:image must point at og-card.png; got ${ogImageHref}`,
  )
  assert.match(
    twitterImageHref,
    /og-card\.png(?:$|\?)/,
    `twitter:image must point at og-card.png; got ${twitterImageHref}`,
  )
})
