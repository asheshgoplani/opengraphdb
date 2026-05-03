import * as assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

// c17-ui L1 regression: the doc page used to render its prose with the
// Tailwind typography defaults — h1/h2/h3 fell back to Inter while every
// other display surface in the app (landing <h1>, claims <h1>, the
// DocPage 404 fallback) uses Fraunces via `font-display`. The handoff
// from a marketing surface to a `/docs/<slug>` page felt typographically
// wrong. Pin the prose-heading override so future refactors of the
// article className don't silently regress the rhythm.
const compiledDir = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(compiledDir, '..', '..')
const docPagePath = resolve(frontendRoot, 'src', 'pages', 'DocPage.tsx')

function readSource(): string {
  return readFileSync(docPagePath, 'utf8')
}

test('DocPage article applies font-display to prose headings', () => {
  const src = readSource()
  const articleMatch = src.match(/<article\b[^>]*className="([^"]+)"/)
  const className = articleMatch?.[1]
  assert.ok(
    typeof className === 'string',
    'expected DocPage to render an <article className="..."> element',
  )
  assert.match(
    className,
    /prose-headings:font-display/,
    `article must apply prose-headings:font-display so doc h1/h2/h3 use Fraunces, got: ${className}`,
  )
})

// c17-ui L2 regression: the section divider above "View source on GitHub"
// used `border-border/60`, which renders as a faint smear on dark mode
// (--border at 24 14% 22% × 0.6 alpha against a near-black --background).
// Drop the alpha so the divider registers as an actual section break.
test('DocPage article hr uses full --border opacity (no /60 alpha mix)', () => {
  const src = readSource()
  const hrMatch = src.match(/<hr\b[^>]*className="([^"]+)"/)
  const className = hrMatch?.[1]
  assert.ok(
    typeof className === 'string',
    'expected DocPage to render an <hr className="..."> element',
  )
  assert.doesNotMatch(
    className,
    /border-border\/\d+/,
    `hr must use full --border opacity (no /xx alpha mix), got: ${className}`,
  )
  assert.match(
    className,
    /\bborder-border\b/,
    `hr must still route through --border, got: ${className}`,
  )
})
