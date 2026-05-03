// Pins the c14 graph-mode flag parser. Phase-1 GLOW flipped defaults
// back to '2d' — the 3D renderer is now a power-user toggle behind
// ?graph=3d. The hash form `#graph=3d` survives the AppShellRouter
// `/` → `/playground` Navigate replaceState round-trip for shareable
// links into the 3D power-user mode.
import { describe, expect, it } from 'vitest'
import { parseGraphMode } from '../src/graph/obsidian3d/graphModeFlag'

describe('graph-mode flag parser', () => {
  it('defaults to "2d" with empty search and hash', () => {
    expect(parseGraphMode('', '')).toBe('2d')
  })

  it('returns "2d" when ?graph=2d is explicit', () => {
    expect(parseGraphMode('?graph=2d', '')).toBe('2d')
  })

  it('returns "3d" when ?graph=3d opts into the power-user toggle', () => {
    expect(parseGraphMode('?graph=3d', '')).toBe('3d')
  })

  it('returns "3d" when graph=3d is one of multiple params', () => {
    expect(parseGraphMode('?dataset=movielens&graph=3d', '')).toBe('3d')
  })

  it('accepts URLSearchParams in place of a raw search string', () => {
    expect(parseGraphMode(new URLSearchParams('?graph=3d'), '')).toBe('3d')
  })

  it('honors the "#graph=3d" hash fallback (replaceState-safe)', () => {
    expect(parseGraphMode('', '#graph=3d')).toBe('3d')
  })

  it('honors the "#graph=2d" hash explicit form', () => {
    expect(parseGraphMode('', '#graph=2d')).toBe('2d')
  })

  it('search wins over hash when both are present and conflict', () => {
    // If a user lands on /?graph=2d#graph=3d we obey the search param.
    // (Search is the more visible / canonical share-link form.)
    expect(parseGraphMode('?graph=2d', '#graph=3d')).toBe('2d')
  })

  it('falls through to default for unknown values', () => {
    expect(parseGraphMode('?graph=sigma', '')).toBe('2d')
    expect(parseGraphMode('', '#graph=cosmos')).toBe('2d')
  })
})
