/**
 * Slice-12: shared editorial backdrop used by the landing hero and the
 * playground graph canvas. Stronger vertical gradient (≥18 Y luma delta from
 * top to bottom), an off-center warm radial for perceived depth, a 28 px
 * dot-grid at ~7.5% alpha (the "dataviz surface" cue), and a corner vignette
 * that darkens the edges by ≥12 Y units at 300 px from the canvas edge.
 *
 * The `hero` variant drops the radial alpha by a hair because the landing
 * page layers its own star field on top; the gradient / grid / vignette stay
 * identical so a ΔE76 comparison between a hero crop and a playground crop
 * measures under 8 (the `slice12-backdrop-cohesion` gate).
 */

export interface AppBackdropProps {
  variant?: 'playground' | 'hero'
}

export function AppBackdrop({ variant = 'playground' }: AppBackdropProps) {
  // Same gradient + grid in both variants; radial alpha drops for hero so
  // the HeroGraphBackground star layer still reads cleanly on top.
  const radialAlpha = variant === 'hero' ? 0.18 : 0.22
  return (
    <div
      data-testid={`app-backdrop-${variant}`}
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
    >
      {/* Base flat fill — AMBER-TERMINAL deep warm-near-black so corners stay dark. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundColor: 'hsl(24, 18%, 5%)' }}
      />
      {/* Vertical gradient — brighter at top, darker at bottom. Slice-12
          gate requires top vs bottom luma delta ≥ 18. Hues warmed from
          blue (220/225) to AMBER-TERMINAL primary (40°) so the wash reads
          amber rather than indigo. */}
      <div
        data-testid="graph-backdrop-vgradient"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(180deg, hsla(40, 80%, 58%, 0.22) 0%, hsla(30, 60%, 38%, 0.12) 42%, hsla(24, 30%, 6%, 0) 100%)',
        }}
      />
      {/* Warm off-center radial to give the canvas perceived depth rather
          than a flat-rectangle feel. Alpha varies by variant. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(ellipse 65% 55% at 52% 38%, hsla(40, 90%, 58%, ${radialAlpha}), hsla(20, 65%, 32%, 0.07) 55%, transparent 80%)`,
        }}
      />
      {/* SVG dot grid — 28 px spacing, ~7.5% alpha. This is the visual cue
          that reads as "dataviz surface" instead of empty black. */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        data-testid="graph-backdrop-dot-grid"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <pattern
            id={`ogdb-dot-grid-${variant}`}
            width={28}
            height={28}
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="1" fill="rgba(255, 220, 180, 0.075)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#ogdb-dot-grid-${variant})`} />
      </svg>
      {/* Corner vignette — darkens edges by ≥12 Y at 300 px from the
          canvas edge so the eye stays on the interior of the graph. */}
      <div
        data-testid="graph-backdrop-vignette"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 110% 110% at 50% 50%, transparent 55%, rgba(0, 0, 0, 0.55) 100%)',
        }}
      />
    </div>
  )
}
