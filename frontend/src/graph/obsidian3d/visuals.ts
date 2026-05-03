// Pure rendering helpers for Obsidian3DGraph.
//
// Why a sibling module instead of cross-importing from the 2D `colors.ts`:
//   * The 2D palette is delivered as CSS strings (#RRGGBB / hsl(…)) for
//     Canvas's `fillStyle` API.
//   * `THREE.MeshLambertMaterial.color` consumes 24-bit ints (0xRRGGBB).
//   * Rather than parse-on-every-render in the React tree, we keep the
//     same categorical mapping but pre-compute the int form once here.
//
// Mirroring the bold-redesign palette (`graph/obsidian/colors.ts`):
//
//   Movie  cream  → 0xF5E6C8 (dark mode) / 0xA8884E (light mode)
//   Genre  purple → 0x9B6BFF (dark mode) / 0x5B33C7 (light mode)
//   Person teal   → 0x5FD3C6 (dark mode) / 0x2F8B82 (light mode)
//
// Unknown labels route through a deterministic palette + paletteHash so
// distinct labels in a non-Movie/Genre/Person ontology still get visually-
// distinct hues — same fall-through used by the 2D renderer.

const FALLBACK_PALETTE_DARK_3D: ReadonlyArray<number> = [
  0xffb478, // warm orange (matches HSL(20 92% 64%) in 2D)
  0xfde079, // amber yellow (HSL(50 95% 68%))
  0xc78bff, // light purple (HSL(282 72% 72%))
  0xff9f63, // warm coral
  0xfdcc66, // muted gold
  0xb084ff, // softer lilac
]

const FALLBACK_PALETTE_LIGHT_3D: ReadonlyArray<number> = [
  0xb45a1c, // dark warm orange (HSL(20 82% 40%))
  0xa67800, // dark amber (HSL(50 80% 38%))
  0x6b3aa3, // dark purple (HSL(282 60% 42%))
  0x9c4d18, // dark coral
  0x8a6800, // dark gold
  0x523982, // dark lilac
]

export const KNOWN_LABEL_COLORS_3D_DARK: ReadonlyMap<string, number> = new Map([
  ['Movie', 0xf5e6c8],
  ['Genre', 0x9b6bff],
  ['Person', 0x5fd3c6],
])

export const KNOWN_LABEL_COLORS_3D_LIGHT: ReadonlyMap<string, number> = new Map([
  ['Movie', 0xa8884e],
  ['Genre', 0x5b33c7],
  ['Person', 0x2f8b82],
])

function paletteHash(label: string): number {
  let h = 0
  for (let i = 0; i < label.length; i += 1) h = (h * 31 + label.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function colorForLabel3D(
  label: string | undefined,
  isDark: boolean,
  labelIndex?: Map<string, number>,
): number {
  const palette = isDark ? FALLBACK_PALETTE_DARK_3D : FALLBACK_PALETTE_LIGHT_3D
  const fallback = palette[0] ?? 0xffb478
  if (!label) return fallback
  const knownMap = isDark ? KNOWN_LABEL_COLORS_3D_DARK : KNOWN_LABEL_COLORS_3D_LIGHT
  const known = knownMap.get(label)
  if (known != null) return known
  const idx = labelIndex?.get(label)
  if (typeof idx === 'number') {
    return palette[idx % palette.length] ?? fallback
  }
  return palette[paletteHash(label) % palette.length] ?? fallback
}

// Per-node opacity from focus k-hop distance — mirrors the 2D 3-tier
// fade contract:
//   focus + 1-hop → 1.0  (full opacity)
//   2-hop         → 0.5  ("ripple" tier — present but secondary)
//   beyond 2-hop  → 0.18 (background dim — visible enough that the
//                          graph's outline still reads, low enough that
//                          the focus neighbourhood owns the eye)
//
// `focusHops === null` means no node is focused, so every node renders
// at 1.0 (matches the 2D `focused == null` short-circuit in drawNode).
export function opacityForHop(
  focusHops: ReadonlyMap<string | number, number> | null,
  nodeId: string | number,
): number {
  if (focusHops == null) return 1
  const hop = focusHops.get(nodeId)
  if (hop == null) return 0.18
  if (hop >= 2) return 0.5
  return 1
}
