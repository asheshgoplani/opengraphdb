// Phase-3 STORY — particle stream renderer (canvas 2D, NOT WebGL).
//
// EdgeFlow draws a configurable bank of "spark" sprites flowing from a
// source point to a target point along a chord (or quadratic bezier when
// the host edge has curvature). The bank is pre-allocated once at mount
// — we DO NOT re-allocate per edge — and re-targeted by mutating
// `from`/`to` on the same instance. Spec: 6-12 instanced sprites at
// 0.012 edge-length per frame.
//
// The renderer is detached from React's render loop. ObsidianGraph
// registers a draw callback into ForceGraph2D's `onRenderFramePost`,
// which fires after the canvas has settled per frame. We hand back a
// `draw(ctx)` method that paints particles in the current world-space
// transform.
//
// Lifetime model: a single EdgeFlow lives for the whole graph mount.
// `setSegment(from, to, curvature)` re-targets the bank for the next
// edge in the path. `clear()` parks the bank off-screen. Cancellation
// is therefore a single ref toggle, no allocation churn.
//
// Color: TRAVERSAL_ACCENT (sacred cyan-blue). Each particle has a
// per-sprite phase offset so they stagger evenly along the edge.
//
// Note on world-space: ForceGraph2D paints in world units. The
// `globalScale` argument from `onRenderFramePost` lets us size sprites
// in screen-pixel space regardless of zoom level — we divide our pixel
// radius by globalScale.

import { PARTICLE_COUNT, PARTICLE_RADIUS_PX, PARTICLE_SPEED, TRAVERSAL_ACCENT } from './palette'

interface Point {
  x: number
  y: number
}

export interface EdgeFlowSegment {
  from: Point
  to: Point
  curvature: number
}

interface ParticleState {
  // Position along the edge as a fraction in [0, 1). Wraps continuously
  // so the visual is a steady stream rather than a one-shot pulse.
  t: number
}

export class EdgeFlow {
  private particles: ParticleState[]
  private segment: EdgeFlowSegment | null = null
  private active = false

  constructor(count: number = PARTICLE_COUNT) {
    // Pre-allocate the entire bank up front. Each particle starts at a
    // staggered phase so the stream is visible from frame 0.
    this.particles = Array.from({ length: count }, (_, i) => ({
      t: i / count,
    }))
  }

  setSegment(from: Point, to: Point, curvature: number = 0): void {
    this.segment = { from, to, curvature }
    this.active = true
  }

  clear(): void {
    this.active = false
    this.segment = null
  }

  isActive(): boolean {
    return this.active && this.segment != null
  }

  // Advance every particle by PARTICLE_SPEED, wrapping at 1. Called
  // once per RAF tick by the traversal driver.
  tick(): void {
    if (!this.active) return
    for (const p of this.particles) {
      p.t += PARTICLE_SPEED
      if (p.t >= 1) p.t -= 1
    }
  }

  // Sample (x, y) along the segment for a given t. Quadratic-bezier
  // for curved edges so the stream visually hugs the same arc the host
  // edge draws; straight-line otherwise.
  private samplePoint(seg: EdgeFlowSegment, t: number): Point {
    const { from, to, curvature } = seg
    if (curvature === 0) {
      return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
    }
    const mx = (from.x + to.x) / 2
    const my = (from.y + to.y) / 2
    const dx = to.x - from.x
    const dy = to.y - from.y
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const cx = mx + nx * curvature * len
    const cy = my + ny * curvature * len
    // Quadratic Bezier at parameter t: (1-t)²·P0 + 2(1-t)t·C + t²·P1
    const u = 1 - t
    const x = u * u * from.x + 2 * u * t * cx + t * t * to.x
    const y = u * u * from.y + 2 * u * t * cy + t * t * to.y
    return { x, y }
  }

  // Paint into the current world-space ForceGraph2D context. globalScale
  // converts our pixel-space radius into world units so the sprite
  // size is stable across zoom levels.
  draw(ctx: CanvasRenderingContext2D, globalScale: number): void {
    if (!this.active || !this.segment) return
    const r = PARTICLE_RADIUS_PX / Math.max(0.0001, globalScale)
    ctx.save()
    ctx.fillStyle = TRAVERSAL_ACCENT
    ctx.shadowColor = TRAVERSAL_ACCENT
    ctx.shadowBlur = 8 / Math.max(0.0001, globalScale)
    for (const p of this.particles) {
      const pt = this.samplePoint(this.segment, p.t)
      // Trailing alpha so the head reads brighter than the tail without
      // a separate ribbon pass. globalAlpha is restored below.
      ctx.globalAlpha = 0.45 + 0.55 * p.t
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
}
