// Phase-3 STORY — sacred-blue traversal accent.
//
// `TRAVERSAL_ACCENT` is the cyan-blue hex reserved EXCLUSIVELY for the
// active traversal cinematic (lit source/target nodes, particle stream,
// active edge stroke, step-counter badge). Every other surface in the
// playground stays in the warm/AMBER family. The CI gate at
// scripts/check-token-sacred-blue.sh enforces that this hex appears
// only in palette.ts, traversal.ts, edgeFlow.ts, StepCounterBadge.tsx,
// DemoPathButton.tsx, and ObsidianGraph.tsx — anywhere else and the
// build fails.
//
// Why a constant here vs. inline: a single source means visual alignment
// across the four cinematic surfaces (badge text, particle sprites, lit
// node halo, active edge stroke) is structurally guaranteed.
export const TRAVERSAL_ACCENT = '#5B9DFF'

// Faded variant for non-active path edges during the cinematic. Same hue,
// reduced saturation/alpha so the path is visible end-to-end as a hint
// while only the *current* segment ignites at full intensity.
export const TRAVERSAL_ACCENT_DIM = 'rgba(91,157,255,0.25)'

// Particle stream config — pre-allocated count and travel speed (in
// edge-length units per frame). Spec: 6-12 sprites; we settle on 8 for
// a comfortable mid-density that reads as flow without becoming a stripe.
export const PARTICLE_COUNT = 8
export const PARTICLE_SPEED = 0.012
export const PARTICLE_RADIUS_PX = 2.4
