// Phase-1 GLOW — selective halo utility for the 2D ObsidianGraph.
//
// Brief recap (kept short — implementation details belong in code, not docs):
//   * Selective: focus / hovered / accent (top-N hub) glow; leaves don't.
//   * Halo: ctx.createRadialGradient. inner stop = node-color @ 0.85α,
//     outer stop = node-color @ 0α. Radius = node-radius × 3 base
//     (× 4.5 reserved for the Phase-2 heartbeat peak).
//   * Per-tier intensity multiplier on the inner-stop alpha:
//       focus 1.0, hovered 0.85, top-N hub 0.45, leaf 0 (no halo).
//   * Compositing: 'lighter' so overlapping halos additively brighten.
//
// `withAlpha` lives in colors.ts and already handles hex / hsl / rgb;
// glow keeps its own helpers small and pure so the unit tests can pin
// rgba interpolation independently of the categorical-palette code.

import { withAlpha } from './colors'

export type GlowTier = 'focus' | 'hover' | 'hub' | 'leaf'

// Inner-stop alpha multipliers — pinned so the unit test can assert the
// per-tier ratio without re-deriving it from a render-pass.
export const GLOW_TIER_ALPHA: Readonly<Record<GlowTier, number>> = {
  focus: 1,
  hover: 0.85,
  hub: 0.45,
  leaf: 0,
}

// Halo radius scales with node radius. The base multiplier is 3×; the
// Phase-2 heartbeat will animate up to 4.5× at peak. Phase-1 ships the
// base only — kept as a constant so Phase-2 can ramp between them
// without touching this module's call signature.
export const GLOW_RADIUS_MULT_BASE = 3
export const GLOW_RADIUS_MULT_PEAK = 4.5

// Inner-stop alpha at the GLOW_TIER_ALPHA[tier]=1.0 reference. The brief
// pins this at 0.85 so the focus halo's center is dense but not opaque
// (a fully-opaque halo would obscure the node's solid disc).
export const GLOW_INNER_ALPHA_AT_FOCUS = 0.85

// Pure: returns the inner-stop alpha for a given tier and an optional
// 0..1 heartbeat phase (Phase-2). Phase-1 callers pass phase=0 (or omit
// it). Output is clamped to [0, 1] so a future caller passing phase>1
// can't blow the alpha out of range.
export function glowInnerAlpha(tier: GlowTier, phase: number = 0): number {
  const base = GLOW_TIER_ALPHA[tier] * GLOW_INNER_ALPHA_AT_FOCUS
  // Heartbeat boosts the alpha by up to +0.15 at peak, scaled by the
  // tier's base. A leaf (tier alpha = 0) stays 0 regardless of phase —
  // selective glow must remain selective even mid-heartbeat.
  const boost = GLOW_TIER_ALPHA[tier] * 0.15 * Math.max(0, Math.min(1, phase))
  return Math.max(0, Math.min(1, base + boost))
}

// Pure: returns the halo radius for a given node radius and heartbeat
// phase. Phase=0 → BASE multiplier, phase=1 → PEAK multiplier; linear
// interpolation in between. Reserved for the Phase-2 caller; Phase-1
// passes phase=0.
export function glowRadius(nodeRadius: number, phase: number = 0): number {
  const p = Math.max(0, Math.min(1, phase))
  const mult = GLOW_RADIUS_MULT_BASE + (GLOW_RADIUS_MULT_PEAK - GLOW_RADIUS_MULT_BASE) * p
  return nodeRadius * mult
}

// Selective tier picker. The leaf-vs-hub split is "is this id in the
// hub set?" — callers pass the precomputed top-N hub set so the
// hub-membership lookup is O(1) per draw call.
//
// Priority resolution: focus > hover > hub > leaf. A node that is both
// the focused node AND a top-N hub still draws as 'focus' (the brighter
// halo wins).
export function pickGlowTier(args: {
  id: string | number
  focusId: string | number | null | undefined
  hoverId: string | number | null | undefined
  hubIds: ReadonlySet<string | number>
}): GlowTier {
  if (args.focusId != null && args.id === args.focusId) return 'focus'
  if (args.hoverId != null && args.id === args.hoverId) return 'hover'
  if (args.hubIds.has(args.id)) return 'hub'
  return 'leaf'
}

// Draws a selective halo onto the supplied context. Returns true when a
// halo was painted (tier is non-leaf), false otherwise — useful for
// callers that want to track the halo-paint count for verification.
//
// The caller is responsible for the surrounding `ctx.save()` /
// `ctx.restore()` because we mutate `globalCompositeOperation`. Doing
// the save here would force every caller to wrap glowDraw in a useless
// outer save/restore pair, since they typically also alpha-tier the
// node body in the same pass.
export function drawGlowHalo(
  ctx: CanvasRenderingContext2D,
  args: {
    x: number
    y: number
    nodeRadius: number
    color: string
    tier: GlowTier
    phase?: number
  },
): boolean {
  const innerAlpha = glowInnerAlpha(args.tier, args.phase ?? 0)
  if (innerAlpha <= 0) return false
  const r = glowRadius(args.nodeRadius, args.phase ?? 0)
  const grad = ctx.createRadialGradient(args.x, args.y, 0, args.x, args.y, r)
  grad.addColorStop(0, withAlpha(args.color, innerAlpha))
  grad.addColorStop(1, withAlpha(args.color, 0))
  // 'lighter' blend so overlapping halos additively brighten — two
  // adjacent focus halos read as a single brighter glow rather than
  // overpainting each other into a flat patch.
  const prevComposite = ctx.globalCompositeOperation
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(args.x, args.y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalCompositeOperation = prevComposite
  return true
}
