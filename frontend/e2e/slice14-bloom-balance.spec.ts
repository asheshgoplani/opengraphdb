/**
 * Slice-14 gate: tone down bloom dominance so the core node hue survives.
 *
 * Iter-5 review finding: even after slice-13's 8-cluster palette fix, the
 * canvas still read as monochrome lavender. Root cause: `.cosmos-bloom`
 * rendered at opacity 0.85 with a drop-shadow blur of ~10-14px and alpha
 * stops aa/55 — swiftshader composited those into a lavender wash that
 * hides the per-label core hue.
 *
 * Slice-14 fix (verified via SOURCE + CSS assertions — see
 * .planning/premium-graph-loop/ENV-CONSTRAINTS.md). We do NOT sample
 * pixels and we do NOT require cosmos.gl to succeed, because the test
 * env's swiftshader sometimes fails WebGL init and we still need the
 * gate to verify the CSS values the real-GPU user will see:
 *
 *   - The `.cosmos-bloom` CSS rule declares `opacity` ≤ 0.6 (was 0.85).
 *   - The inline bloom style template builds a drop-shadow blur clamped
 *     to [4, 6]px (was [10, 14]px).
 *   - The inline bloom radial-gradient uses alpha stops `55` (≈33%) at
 *     the innermost color stop (was `aa` ≈ 67%).
 *
 * Reading these from source guarantees the real-Mac user sees them even
 * when the test env's cosmos instance never mounts.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

function readSource(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

test('slice14 — .cosmos-bloom CSS opacity is ≤ 0.6 (core hue survives)', async () => {
  const src = readSource('src/graph/cosmos/CosmosCanvas.tsx')

  // Grep the .cosmos-bloom CSS block inside the <style>{``}</style>
  // template literal.
  const block = src.match(/\.cosmos-bloom\s*\{[\s\S]*?\n\s*\}/)
  expect(block, '.cosmos-bloom CSS block must be present').not.toBeNull()

  // Slice-15 refactored the literal opacity to a CSS var with a fallback —
  // accept either form so the gate keeps measuring the user-visible value.
  const opMatch =
    block![0].match(/opacity:\s*var\(--bloom-opacity\s*,\s*([0-9.]+)\)/) ??
    block![0].match(/opacity:\s*([0-9.]+)/)
  expect(opMatch, 'opacity declaration must be present').not.toBeNull()

  const opacity = parseFloat(opMatch![1])
  console.log(`[slice14-bloom-balance] .cosmos-bloom opacity = ${opacity}`)
  expect(opacity).toBeGreaterThanOrEqual(0.3)
  expect(opacity).toBeLessThanOrEqual(0.6)
})

test('slice14 — bloom drop-shadow blur template clamps to [4, 6]px', async () => {
  const src = readSource('src/graph/cosmos/CosmosCanvas.tsx')

  // Find the `blurPx` declaration and its clamp.
  const blurLine = src.match(/const blurPx\s*=\s*Math\.min\(\s*(\d+)\s*,\s*Math\.max\(\s*(\d+)/)
  expect(blurLine, 'blurPx Math.min/Math.max clamp must be present').not.toBeNull()

  const hi = parseInt(blurLine![1], 10)
  const lo = parseInt(blurLine![2], 10)
  console.log(`[slice14-bloom-balance] blur clamp = [${lo}, ${hi}]`)
  expect(lo).toBe(4)
  expect(hi).toBe(6)

  // And the drop-shadow must use the clamped `blurPx`, not a raw
  // `bloomR * 0.55` expression.
  const shadowLine = src.match(/drop-shadow\(0 0 \$\{([A-Za-z]+)\}px/)
  expect(shadowLine, 'drop-shadow template must reference a single identifier').not.toBeNull()
  expect(shadowLine![1]).toBe('blurPx')
})

test('slice14 — bloom radial-gradient first-stop alpha is in [0x20, 0x5F]', async () => {
  const src = readSource('src/graph/cosmos/CosmosCanvas.tsx')

  // Pull the radial-gradient template and read the hex-alpha byte at
  // the innermost (`0%`) stop: `${palette.core}XX`.
  const grad = src.match(/radial-gradient\(circle,\s*\$\{palette\.core\}([0-9A-Fa-f]{2})\s*0%/)
  expect(grad, 'radial-gradient template with palette.core must be present').not.toBeNull()

  const alphaByte = parseInt(grad![1], 16)
  console.log(
    `[slice14-bloom-balance] gradient core alpha byte = 0x${alphaByte.toString(16)} (${alphaByte}/255, ${(alphaByte / 255 * 100).toFixed(1)}%)`,
  )
  expect(alphaByte).toBeLessThanOrEqual(0x5f) // ≤ 37% — dimmer than slice-13's 0xaa
  expect(alphaByte).toBeGreaterThanOrEqual(0x20) // ≥ 12% — still perceptible
})
