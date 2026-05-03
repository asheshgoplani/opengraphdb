// Pins the pure helpers that drive the Obsidian3DGraph renderer:
//   * colorForLabel3D: AMBER-TERMINAL → categorical Movie/Genre/Person hex
//     ints, mirroring the 2D `colorForLabel` contract; ensures the
//     bold-redesign palette transfer didn't get garbled in the 8-bit-int
//     conversion required for THREE.MeshLambertMaterial.color.
//   * opacityForHop: per-node material.opacity from focus k-hop distance,
//     mirroring the 2D 3-tier fade (focus + 1-hop = 1.0; 2-hop = 0.5;
//     rest = 0.18) so playground users see the same neighbourhood-fade
//     contract on the 3D renderer.
import { describe, expect, it } from 'vitest'
import {
  KNOWN_LABEL_COLORS_3D_DARK,
  KNOWN_LABEL_COLORS_3D_LIGHT,
  colorForLabel3D,
  opacityForHop,
} from '../src/graph/obsidian3d/visuals'

describe('obsidian3d colorForLabel3D', () => {
  it('returns the categorical Movie cream in dark mode', () => {
    expect(colorForLabel3D('Movie', true)).toBe(0xf5e6c8)
  })

  it('returns the categorical Genre purple in dark mode', () => {
    expect(colorForLabel3D('Genre', true)).toBe(0x9b6bff)
  })

  it('returns the categorical Person teal in dark mode', () => {
    expect(colorForLabel3D('Person', true)).toBe(0x5fd3c6)
  })

  it('returns darker categorical hex in light mode (Movie)', () => {
    expect(colorForLabel3D('Movie', false)).toBe(0xa8884e)
  })

  it('returns darker categorical hex in light mode (Genre)', () => {
    expect(colorForLabel3D('Genre', false)).toBe(0x5b33c7)
  })

  it('returns darker categorical hex in light mode (Person)', () => {
    expect(colorForLabel3D('Person', false)).toBe(0x2f8b82)
  })

  it('falls through to a deterministic fallback for unknown labels', () => {
    const a = colorForLabel3D('Director', true)
    const b = colorForLabel3D('Director', true)
    expect(a).toBe(b)
    // Unknown label MUST NOT collapse to a categorical Movie/Genre/Person hue.
    expect(a).not.toBe(0xf5e6c8)
    expect(a).not.toBe(0x9b6bff)
    expect(a).not.toBe(0x5fd3c6)
  })

  it('uses labelIndex routing when supplied (deterministic distinct slots)', () => {
    const idx = new Map([
      ['Director', 0],
      ['Studio', 1],
    ])
    const a = colorForLabel3D('Director', true, idx)
    const b = colorForLabel3D('Studio', true, idx)
    expect(a).not.toBe(b)
  })

  it('returns the dark-mode fallback for missing label', () => {
    expect(typeof colorForLabel3D(undefined, true)).toBe('number')
    expect(typeof colorForLabel3D(undefined, false)).toBe('number')
  })

  it('exposes the categorical maps for renderer consumption', () => {
    expect(KNOWN_LABEL_COLORS_3D_DARK.get('Movie')).toBe(0xf5e6c8)
    expect(KNOWN_LABEL_COLORS_3D_DARK.get('Genre')).toBe(0x9b6bff)
    expect(KNOWN_LABEL_COLORS_3D_DARK.get('Person')).toBe(0x5fd3c6)
    expect(KNOWN_LABEL_COLORS_3D_LIGHT.get('Movie')).toBe(0xa8884e)
    expect(KNOWN_LABEL_COLORS_3D_LIGHT.get('Genre')).toBe(0x5b33c7)
    expect(KNOWN_LABEL_COLORS_3D_LIGHT.get('Person')).toBe(0x2f8b82)
  })
})

describe('obsidian3d opacityForHop', () => {
  it('returns 1.0 when no focus (null hop map)', () => {
    expect(opacityForHop(null, 'a')).toBe(1)
  })

  it('returns 1.0 for the focus node itself (hop=0)', () => {
    const hops = new Map<string | number, number>([['a', 0]])
    expect(opacityForHop(hops, 'a')).toBe(1)
  })

  it('returns 1.0 for direct neighbours (hop=1)', () => {
    const hops = new Map<string | number, number>([
      ['a', 0],
      ['b', 1],
    ])
    expect(opacityForHop(hops, 'b')).toBe(1)
  })

  it('returns 0.5 for 2-hop nodes', () => {
    const hops = new Map<string | number, number>([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ])
    expect(opacityForHop(hops, 'c')).toBe(0.5)
  })

  it('returns 0.18 for nodes outside the 2-hop ring', () => {
    const hops = new Map<string | number, number>([
      ['a', 0],
      ['b', 1],
    ])
    // 'z' isn't in the hop map → outside the neighbourhood.
    expect(opacityForHop(hops, 'z')).toBe(0.18)
  })
})
