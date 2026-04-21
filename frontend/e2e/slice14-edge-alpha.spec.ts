/**
 * Slice-14 gate: edge alpha ≥ 0.75 with saturated-hue distinct palette.
 *
 * Iter-5 review finding: edges rendered at alpha 0.55 disappeared into the
 * navy backdrop on real GPUs, making all edge types look identical. Also
 * the EDGE_PALETTE clustered at pastels (94A3FF, A78BFA, F472B6) which
 * blurred into one purple family.
 *
 * Slice-14 fix (verified via JSON introspection + saturation math — see
 * .planning/premium-graph-loop/ENV-CONSTRAINTS.md):
 *   - Every EDGE_PALETTE hex decodes to HSL saturation ≥ 0.55.
 *   - ≥ 4 distinct HSL hue buckets (45°-wide) are represented across the
 *     8 common edge types (KNOWS, ACTED_IN, RATED, INTERACTS, APPEARS_IN,
 *     WORKS_AT, LIVES_IN, LIKES).
 *   - The runtime `edgeAlphaForLink` floor (checked in source) is ≥ 0.75.
 *
 * Why JSON not pixels: swiftshader's alpha blending over the cosmos
 * linkColor buffer is an unreliable pixel signal. The palette definition
 * is the authoritative source of truth.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

function hexToHsl(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let hue = 0
  let sat = 0
  if (max !== min) {
    const d = max - min
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        hue = ((g - b) / d + (g < b ? 6 : 0)) * 60
        break
      case g:
        hue = ((b - r) / d + 2) * 60
        break
      default:
        hue = ((r - g) / d + 4) * 60
    }
  }
  return [hue, sat, l]
}

function readTheme(): string {
  // Tests run from frontend/e2e with cwd frontend/. Use an absolute resolve
  // from __dirname to avoid cwd sensitivity.
  return readFileSync(
    resolve(process.cwd(), 'src/graph/theme.ts'),
    'utf8',
  )
}

// SUBCLASS_OF and ontology hierarchy edges are intentionally muted slate
// so they recede behind the data-carrying edges. Exclude them from the
// "saturated palette" check.
const SATURATION_EXCEPTIONS = new Set<string>(['SUBCLASS_OF'])

test('slice14 — every EDGE_PALETTE data edge type has HSL saturation ≥ 0.55', async () => {
  const src = readTheme()
  const paletteBlock = src.match(/export const EDGE_PALETTE[\s\S]*?\n\}/)
  expect(paletteBlock, 'EDGE_PALETTE block must be present').not.toBeNull()

  // Parse `KEY: '#XXXXXX'` pairs so we can filter by key (not just hex).
  const entries = Array.from(
    paletteBlock![0].matchAll(/([A-Z_]+):\s*'#([0-9A-Fa-f]{6})'/g),
  ).map(([, k, h]) => ({ key: k, hex: `#${h}` }))
  expect(entries.length).toBeGreaterThanOrEqual(8)

  const lowSat: Array<{ key: string; hex: string; s: number }> = []
  for (const { key, hex } of entries) {
    if (SATURATION_EXCEPTIONS.has(key)) continue
    const [, s] = hexToHsl(hex)
    if (s < 0.55) lowSat.push({ key, hex, s: +s.toFixed(3) })
  }
  console.log(
    `[slice14-edge-alpha] palette entries = ${entries.length} (excluding ${[...SATURATION_EXCEPTIONS].join(',')}), low-sat = ${lowSat.length}`,
  )
  expect(lowSat).toEqual([])
})

test('slice14 — 8 common edge types span ≥ 4 distinct 45° hue buckets', async () => {
  const src = readTheme()
  const wanted = [
    'KNOWS',
    'ACTED_IN',
    'RATED',
    'INTERACTS',
    'APPEARS_IN',
    'WORKS_AT',
    'LIVES_IN',
    'LIKES',
  ]
  const hues: number[] = []
  for (const key of wanted) {
    const re = new RegExp(`${key}:\\s*'#([0-9A-Fa-f]{6})'`)
    const m = src.match(re)
    expect(m, `${key} must be present in EDGE_PALETTE`).not.toBeNull()
    const [h] = hexToHsl(`#${m![1]}`)
    hues.push(h)
  }
  const buckets = new Set<number>(hues.map((h) => Math.floor(h / 45) % 8))
  console.log(
    `[slice14-edge-alpha] 8-type hues = [${hues.map((x) => x.toFixed(0)).join(', ')}], distinct 45° buckets = ${buckets.size}`,
  )
  expect(buckets.size).toBeGreaterThanOrEqual(4)
})

test('slice14 — edgeAlphaForLink floor ≥ 0.75 (asserts source)', async () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/graph/cosmos/CosmosCanvas.tsx'),
    'utf8',
  )
  // Grab the edgeAlphaForLink function body.
  const fn = src.match(/function edgeAlphaForLink[\s\S]*?\n\}/)
  expect(fn, 'edgeAlphaForLink must exist').not.toBeNull()
  const body = fn![0]

  // The clamp-floor and no-weight fallback must both be ≥ 0.75.
  const clampMatch = body.match(/Math\.max\(\s*([0-9.]+)\s*,\s*Math\.min\(\s*([0-9.]+)/)
  expect(clampMatch, 'Math.max(...)/Math.min(...) clamp pair must exist').not.toBeNull()
  const floor = parseFloat(clampMatch![1])
  console.log(`[slice14-edge-alpha] edgeAlphaForLink floor = ${floor}`)
  expect(floor).toBeGreaterThanOrEqual(0.75)

  // The no-weight fallback `return N` must also be ≥ 0.75.
  const fallback = body.match(/\n\s*return\s+([0-9.]+)/)
  expect(fallback, 'no-weight fallback return must exist').not.toBeNull()
  const fv = parseFloat(fallback![1])
  console.log(`[slice14-edge-alpha] no-weight fallback = ${fv}`)
  expect(fv).toBeGreaterThanOrEqual(0.75)
})
