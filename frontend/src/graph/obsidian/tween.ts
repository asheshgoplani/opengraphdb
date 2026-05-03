// Phase-2 PULSE — pure tween + reduced-motion utilities for the 2D
// ObsidianGraph. Three motion primitives share two needs:
//   1. cubic-bezier easing — used by the 1500ms entry dolly
//   2. heartbeat phase math — a 1Hz sine wave at HEARTBEAT_AMPLITUDE
//      that scales the focused-hub halo radius
// All exports are pure (no DOM, no timers). The matchMedia gate lives
// in `prefersReducedMotion`, called at draw time and at effect setup.

export const HEARTBEAT_PERIOD_MS = 1000
export const HEARTBEAT_AMPLITUDE = 0.06
export const ENTRY_DOLLY_MS = 1500
// Start zoom = fitZ / 1.4, so the graph appears at 1/1.4 of fit size
// (i.e. zoomed out) and dollies inward to fit-bounds.
export const ENTRY_DOLLY_OVERZOOM_OUT = 1.4

// cubic-bezier (P1, P2 with P0=(0,0), P3=(1,1)). Returns a function
// progress→eased-progress. Newton-Raphson solves x(t)=progress for t,
// then evaluates y(t). Converges in ≤8 iterations for the
// (0.4, 0, 0.2, 1) Material standard curve.
export function cubicBezier(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
): (progress: number) => number {
  return (progress: number): number => {
    if (progress <= 0) return 0
    if (progress >= 1) return 1
    let u = progress
    for (let i = 0; i < 8; i += 1) {
      const omu = 1 - u
      const x =
        3 * omu * omu * u * p1x +
        3 * omu * u * u * p2x +
        u * u * u
      const dx =
        3 * omu * omu * p1x +
        6 * omu * u * (p2x - p1x) +
        3 * u * u * (1 - p2x)
      const err = x - progress
      if (Math.abs(err) < 1e-4) break
      u = u - err / Math.max(1e-6, dx)
    }
    const omu = 1 - u
    return (
      3 * omu * omu * u * p1y +
      3 * omu * u * u * p2y +
      u * u * u
    )
  }
}

export const EASE_STANDARD = cubicBezier(0.4, 0, 0.2, 1)

// 1Hz heartbeat phase: 0..1..0 over HEARTBEAT_PERIOD_MS. Cosine-shaped
// so the peak (phase=1) lands cleanly at the half-period.
export function heartbeatPhase(elapsedMs: number): number {
  const t = (((elapsedMs % HEARTBEAT_PERIOD_MS) + HEARTBEAT_PERIOD_MS) %
    HEARTBEAT_PERIOD_MS) / HEARTBEAT_PERIOD_MS
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * t)
}

// Halo-radius scale at a given elapsed time: 1.0 .. 1.0 + amplitude.
// At amplitude 0.06 this oscillates between 1.0 and 1.06 over 1 second.
export function heartbeatScale(elapsedMs: number): number {
  return 1 + HEARTBEAT_AMPLITUDE * heartbeatPhase(elapsedMs)
}

// SSR-safe matchMedia gate. Returns false outside a browser (e.g. in
// vitest's node env) so the tween fires unconditionally in unit tests
// while the e2e tests can flip prefers-reduced-motion via Playwright.
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
