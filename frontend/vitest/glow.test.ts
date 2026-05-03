// Pins the Phase-1 GLOW utility:
//   * rgba interpolation correctness (delegates to colors.withAlpha,
//     which already handles hex/hsl/rgb forms)
//   * selective application logic (pickGlowTier priority + alpha
//     multipliers + leaf-stays-zero invariant)
//
// We intentionally don't render through a real CanvasRenderingContext —
// drawGlowHalo is exercised against a tiny mock so the test stays a
// pure unit. The Playwright spec covers the actual canvas pixels.
import { describe, expect, it } from 'vitest'
import {
  GLOW_INNER_ALPHA_AT_FOCUS,
  GLOW_RADIUS_MULT_BASE,
  GLOW_RADIUS_MULT_PEAK,
  GLOW_TIER_ALPHA,
  drawGlowHalo,
  glowInnerAlpha,
  glowRadius,
  pickGlowTier,
} from '../src/graph/obsidian/glow'

describe('GLOW_TIER_ALPHA — per-tier intensity contract', () => {
  it('focus is the brightest tier', () => {
    expect(GLOW_TIER_ALPHA.focus).toBe(1)
  })

  it('hover is dimmer than focus but brighter than hub', () => {
    expect(GLOW_TIER_ALPHA.hover).toBeLessThan(GLOW_TIER_ALPHA.focus)
    expect(GLOW_TIER_ALPHA.hover).toBeGreaterThan(GLOW_TIER_ALPHA.hub)
    // Pinned exactly so a future palette tweak can't drift the brief.
    expect(GLOW_TIER_ALPHA.hover).toBeCloseTo(0.85, 5)
  })

  it('hub is dim but visible (accent for top-N nodes)', () => {
    expect(GLOW_TIER_ALPHA.hub).toBeGreaterThan(0)
    expect(GLOW_TIER_ALPHA.hub).toBeLessThan(GLOW_TIER_ALPHA.hover)
    expect(GLOW_TIER_ALPHA.hub).toBeCloseTo(0.45, 5)
  })

  it('leaf is exactly zero — selective glow must remain selective', () => {
    expect(GLOW_TIER_ALPHA.leaf).toBe(0)
  })
})

describe('glowInnerAlpha — rgba interpolation through tier × phase', () => {
  it('returns 0 for the leaf tier at any heartbeat phase', () => {
    expect(glowInnerAlpha('leaf', 0)).toBe(0)
    expect(glowInnerAlpha('leaf', 0.5)).toBe(0)
    expect(glowInnerAlpha('leaf', 1)).toBe(0)
  })

  it('phase=0 returns the base GLOW_INNER_ALPHA_AT_FOCUS at focus tier', () => {
    expect(glowInnerAlpha('focus', 0)).toBeCloseTo(
      GLOW_INNER_ALPHA_AT_FOCUS,
      5,
    )
  })

  it('phase=1 boosts the focus tier above its base alpha', () => {
    const base = glowInnerAlpha('focus', 0)
    const peak = glowInnerAlpha('focus', 1)
    expect(peak).toBeGreaterThan(base)
    // 1.0 * 0.85 base + 1.0 * 0.15 boost = 1.0 — must clamp to 1.
    expect(peak).toBeCloseTo(1, 5)
  })

  it('alpha is clamped to [0, 1] for out-of-range phase inputs', () => {
    expect(glowInnerAlpha('focus', -1)).toBeGreaterThanOrEqual(0)
    expect(glowInnerAlpha('focus', 2)).toBeLessThanOrEqual(1)
  })

  it('hub tier scales proportionally with the focus tier', () => {
    // The hub tier should receive 0.45× the focus alpha at any phase.
    const hubBase = glowInnerAlpha('hub', 0)
    const focusBase = glowInnerAlpha('focus', 0)
    expect(hubBase / focusBase).toBeCloseTo(GLOW_TIER_ALPHA.hub, 5)
  })
})

describe('glowRadius — heartbeat lerp between BASE and PEAK', () => {
  it('phase=0 returns nodeRadius × BASE multiplier', () => {
    expect(glowRadius(5, 0)).toBe(5 * GLOW_RADIUS_MULT_BASE)
  })

  it('phase=1 returns nodeRadius × PEAK multiplier', () => {
    expect(glowRadius(5, 1)).toBe(5 * GLOW_RADIUS_MULT_PEAK)
  })

  it('phase=0.5 returns the midpoint (linear interpolation)', () => {
    const mid = (GLOW_RADIUS_MULT_BASE + GLOW_RADIUS_MULT_PEAK) / 2
    expect(glowRadius(5, 0.5)).toBeCloseTo(5 * mid, 5)
  })
})

describe('pickGlowTier — selective application priority', () => {
  it('focus wins over hover when the same node id is in both slots', () => {
    expect(
      pickGlowTier({
        id: 'a',
        focusId: 'a',
        hoverId: 'a',
        hubIds: new Set(['a']),
      }),
    ).toBe('focus')
  })

  it('hover wins over hub when ids differ', () => {
    expect(
      pickGlowTier({
        id: 'a',
        focusId: 'b',
        hoverId: 'a',
        hubIds: new Set(['a']),
      }),
    ).toBe('hover')
  })

  it('hub wins over leaf for a top-N node with no focus or hover', () => {
    expect(
      pickGlowTier({
        id: 'a',
        focusId: null,
        hoverId: null,
        hubIds: new Set(['a']),
      }),
    ).toBe('hub')
  })

  it('leaf is the fallback when no tier matches', () => {
    expect(
      pickGlowTier({
        id: 'a',
        focusId: 'b',
        hoverId: 'c',
        hubIds: new Set(['d']),
      }),
    ).toBe('leaf')
  })

  it('handles undefined focus/hover ids gracefully', () => {
    expect(
      pickGlowTier({
        id: 'a',
        focusId: undefined,
        hoverId: undefined,
        hubIds: new Set(),
      }),
    ).toBe('leaf')
  })
})

describe('drawGlowHalo — rgba interpolation hits createRadialGradient', () => {
  // Minimal mock CanvasRenderingContext capturing the calls drawGlowHalo
  // makes. We assert: leaf does NOT paint, non-leaf paints with
  // 'lighter' composite, and the inner-stop alpha is non-zero.
  function makeMockCtx() {
    const stops: Array<{ offset: number; color: string }> = []
    const gradient = {
      addColorStop(offset: number, color: string) {
        stops.push({ offset, color })
      },
    }
    let composite = 'source-over'
    const calls: { arc: number; fill: number; createGrad: number } = {
      arc: 0,
      fill: 0,
      createGrad: 0,
    }
    const ctx = {
      get globalCompositeOperation() {
        return composite
      },
      set globalCompositeOperation(v: string) {
        composite = v
      },
      fillStyle: 'transparent' as string | CanvasGradient,
      createRadialGradient() {
        calls.createGrad += 1
        return gradient as unknown as CanvasGradient
      },
      beginPath() {},
      arc() {
        calls.arc += 1
      },
      fill() {
        calls.fill += 1
      },
    }
    return { ctx: ctx as unknown as CanvasRenderingContext2D, stops, calls, getComposite: () => composite }
  }

  it('leaf tier paints nothing and returns false', () => {
    const { ctx, calls } = makeMockCtx()
    const painted = drawGlowHalo(ctx, {
      x: 0,
      y: 0,
      nodeRadius: 5,
      color: '#ff0000',
      tier: 'leaf',
    })
    expect(painted).toBe(false)
    expect(calls.fill).toBe(0)
    expect(calls.createGrad).toBe(0)
  })

  it('focus tier creates a gradient with non-zero inner alpha and outer alpha=0', () => {
    const { ctx, stops, calls } = makeMockCtx()
    const painted = drawGlowHalo(ctx, {
      x: 0,
      y: 0,
      nodeRadius: 5,
      color: '#ff8800',
      tier: 'focus',
    })
    expect(painted).toBe(true)
    expect(calls.createGrad).toBe(1)
    expect(calls.fill).toBe(1)
    expect(stops.length).toBe(2)
    // Inner stop must contain a non-zero alpha (rgba(...,0.85)).
    expect(stops[0].color).toMatch(/rgba\(255,\s*136,\s*0,\s*0\.85/)
    // Outer stop must be transparent (alpha = 0).
    expect(stops[1].color).toMatch(/rgba\(255,\s*136,\s*0,\s*0\)/)
  })

  it("uses 'lighter' compositing during the halo paint and restores after", () => {
    const { ctx, getComposite } = makeMockCtx()
    drawGlowHalo(ctx, {
      x: 0,
      y: 0,
      nodeRadius: 5,
      color: '#ff8800',
      tier: 'focus',
    })
    // After paint, the composite must be restored to the prior value
    // ('source-over' in our mock) so neighbouring draw calls aren't
    // accidentally additive.
    expect(getComposite()).toBe('source-over')
  })

  it('hsl colour input still produces an alpha-injected gradient (no string-replace bug)', () => {
    // Regression hook for the cycle-12 `hsl(` → `hsla(` bug — withAlpha
    // is the canonical handler now and must yield a parsable hsla(...) /
    // rgba(...) string regardless of the input form.
    const { ctx, stops } = makeMockCtx()
    drawGlowHalo(ctx, {
      x: 0,
      y: 0,
      nodeRadius: 5,
      color: 'hsl(40 95% 62%)',
      tier: 'focus',
    })
    expect(stops[0].color).toMatch(/^hsla\(.+\/\s*0\.85\)$/)
    expect(stops[1].color).toMatch(/^hsla\(.+\/\s*0\)$/)
  })
})
