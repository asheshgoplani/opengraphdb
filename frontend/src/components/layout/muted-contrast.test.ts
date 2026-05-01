import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// .test-dist mirrors src/, so the css lives at ../../index.css from the compiled
// test file. Original source is at <repo>/src/index.css.
function readIndexCss(): string {
  // Walk up to the frontend root and read src/index.css.
  let dir = __dirname
  for (let i = 0; i < 8; i++) {
    try {
      return readFileSync(join(dir, 'src', 'index.css'), 'utf8')
    } catch {
      dir = dirname(dir)
    }
  }
  throw new Error('could not locate src/index.css from test dir')
}

function hslLuminance(h: number, s: number, l: number): number {
  // Convert HSL → linear RGB → relative luminance per WCAG.
  const sN = s / 100
  const lN = l / 100
  const c = (1 - Math.abs(2 * lN - 1)) * sN
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = lN - c / 2
  let [r, g, b] = [0, 0, 0]
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const linearize = (v: number) => {
    const u = v + m
    return u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

function contrast(a: number, b: number): number {
  const L1 = Math.max(a, b)
  const L2 = Math.min(a, b)
  return (L1 + 0.05) / (L2 + 0.05)
}

function extractHsl(css: string, scope: ':root' | '.dark', name: string): [number, number, number] {
  const block = css.split(scope)[1] ?? ''
  const re = new RegExp(`--${name}:\\s*([0-9.]+)\\s+([0-9.]+)%\\s+([0-9.]+)%`)
  const match = block.match(re)
  if (!match) throw new Error(`${name} not found in ${scope} block`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

test('muted-foreground meets WCAG AA 4.5:1 contrast in light mode [H14]', () => {
  const css = readIndexCss()
  const fg = extractHsl(css, ':root', 'muted-foreground')
  const bg = extractHsl(css, ':root', 'background')
  const ratio = contrast(hslLuminance(...fg), hslLuminance(...bg))
  assert.ok(ratio >= 4.5, `light contrast ${ratio.toFixed(2)} < 4.5`)
})

test('muted-foreground meets WCAG AA 4.5:1 contrast in dark mode [H14]', () => {
  const css = readIndexCss()
  const fg = extractHsl(css, '.dark', 'muted-foreground')
  const bg = extractHsl(css, '.dark', 'background')
  const ratio = contrast(hslLuminance(...fg), hslLuminance(...bg))
  assert.ok(ratio >= 4.5, `dark contrast ${ratio.toFixed(2)} < 4.5`)
})
