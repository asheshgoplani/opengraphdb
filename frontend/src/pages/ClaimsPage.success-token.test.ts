import * as assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

// C6-H-1 regression: cycle-5 commit 7c60af5 closed an axe color-contrast
// finding on /claims by switching ClaimsPage's green-status span from
// `text-[hsl(var(--accent))]` (3.95:1 on --card light, below WCAG 2 AA
// 4.5:1) to `text-emerald-700`.            // allow-token-leak
// Cycle-5 commit 92583c9 reverted that one hour later because the raw-
// palette utility tripped the token-leak gate. Cycle 6 introduces a
// `--success` semantic token whose value clears AA against --card in
// both themes; this test pins the token route so a future refactor
// can't silently flip back onto --accent (red axe gate) or onto a raw
// palette utility (red leak gate).
const compiledDir = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(compiledDir, '..', '..')
const claimsPagePath = resolve(frontendRoot, 'src', 'pages', 'ClaimsPage.tsx')
const indexCssPath = resolve(frontendRoot, 'src', 'index.css')

function readSource(): string {
  return readFileSync(claimsPagePath, 'utf8')
}

function readCss(): string {
  return readFileSync(indexCssPath, 'utf8')
}

test('ClaimsPage green-status span routes through --success (not --accent)', () => {
  const src = readSource()
  // The green branch is the one tagged with the CheckCircle2 icon.
  const greenBranchMatch = src.match(
    /<span\s+className="([^"]+)"\s*>\s*<CheckCircle2\b/,
  )
  const className = greenBranchMatch?.[1]
  assert.ok(
    typeof className === 'string',
    'expected ClaimsPage to render a <span className=...><CheckCircle2 /> branch for green status',
  )
  assert.match(
    className,
    /text-\[hsl\(var\(--success\)\)\]/,
    `green-status span must use text-[hsl(var(--success))], got: ${className}`,
  )
  assert.doesNotMatch(
    className,
    /text-\[hsl\(var\(--accent\)\)\]/,
    'green-status span must not use --accent (3.95:1 vs --card light, fails WCAG 2 AA)',
  )
  assert.doesNotMatch(
    className,
    /text-emerald-\d+/,
    'green-status span must not use raw text-emerald-* utilities (would trip token-leak gate)',
  )
})

test('--success and --success-foreground tokens are defined for light theme', () => {
  const css = readCss()
  const lightBlock = css.match(/:root\s*\{([\s\S]*?)\}/)
  const block = lightBlock?.[1]
  assert.ok(typeof block === 'string', 'index.css must declare a :root token block')
  assert.match(
    block,
    /--success:\s*[^;]+;/,
    ':root must define --success for light theme',
  )
  assert.match(
    block,
    /--success-foreground:\s*[^;]+;/,
    ':root must define --success-foreground for light theme',
  )
})

test('--success and --success-foreground tokens are defined for dark theme', () => {
  const css = readCss()
  const darkBlock = css.match(/\.dark\s*\{([\s\S]*?)\}/)
  const block = darkBlock?.[1]
  assert.ok(typeof block === 'string', 'index.css must declare a .dark token block')
  assert.match(
    block,
    /--success:\s*[^;]+;/,
    '.dark must define --success for dark theme',
  )
  assert.match(
    block,
    /--success-foreground:\s*[^;]+;/,
    '.dark must define --success-foreground for dark theme',
  )
})

// c17-ui L3 regression: status cells used to render as plain `green` /
// `red` text next to a check/x icon. Against a row of code-font test
// paths they didn't read as discrete state markers — eyes skimmed past.
// Wrap each status in a rounded pill with a semantic-token background
// (--success / --destructive at low alpha) so the cell carries visual
// mass without changing the palette.
test('ClaimsPage green-status span renders as a rounded pill', () => {
  const src = readSource()
  const greenBranchMatch = src.match(
    /<span\s+className="([^"]+)"\s*>\s*<CheckCircle2\b/,
  )
  const className = greenBranchMatch?.[1]
  assert.ok(typeof className === 'string', 'expected green-status span')
  assert.match(
    className,
    /\brounded-full\b/,
    `green-status span must render as a rounded pill, got: ${className}`,
  )
  assert.match(
    className,
    /bg-\[hsl\(var\(--success\)\)\]\/\d+/,
    `green-status span must carry a --success token background, got: ${className}`,
  )
})

test('ClaimsPage red-status span renders as a rounded pill', () => {
  const src = readSource()
  const redBranchMatch = src.match(
    /<span\s+className="([^"]+)"\s*>\s*<XCircle\b/,
  )
  const className = redBranchMatch?.[1]
  assert.ok(typeof className === 'string', 'expected red-status span')
  assert.match(
    className,
    /\brounded-full\b/,
    `red-status span must render as a rounded pill, got: ${className}`,
  )
  assert.match(
    className,
    /bg-destructive\/\d+/,
    `red-status span must carry a --destructive token background, got: ${className}`,
  )
})
