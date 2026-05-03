// Pins the c14 graph-mode flag parser. Replaces the proto/3d-graph-era
// boolean parser (proto3dFlag.ts) — semantics flip with the migration:
// the default is now '3d', and `?graph=2d` opts back into the legacy
// 2D ObsidianGraph. The hash form `#graph=2d` survives the
// AppShellRouter `/` → `/playground` Navigate replaceState round-trip
// for shareable links.
import { describe, expect, it } from 'vitest'
import { parseGraphMode } from '../src/graph/obsidian3d/graphModeFlag'

describe('graph-mode flag parser', () => {
  it('defaults to "3d" with empty search and hash', () => {
    expect(parseGraphMode('', '')).toBe('3d')
  })

  it('returns "2d" when ?graph=2d is present', () => {
    expect(parseGraphMode('?graph=2d', '')).toBe('2d')
  })

  it('returns "2d" when graph=2d is one of multiple params', () => {
    expect(parseGraphMode('?dataset=movielens&graph=2d', '')).toBe('2d')
  })

  it('returns "3d" when ?graph=3d is explicit', () => {
    expect(parseGraphMode('?graph=3d', '')).toBe('3d')
  })

  it('accepts URLSearchParams in place of a raw search string', () => {
    expect(parseGraphMode(new URLSearchParams('?graph=2d'), '')).toBe('2d')
  })

  it('honors the "#graph=2d" hash fallback (replaceState-safe)', () => {
    expect(parseGraphMode('', '#graph=2d')).toBe('2d')
  })

  it('honors the "#graph=3d" hash explicit form', () => {
    expect(parseGraphMode('', '#graph=3d')).toBe('3d')
  })

  it('search wins over hash when both are present and conflict', () => {
    // If a user lands on /?graph=3d#graph=2d we obey the search param.
    // (Search is the more visible / canonical share-link form.)
    expect(parseGraphMode('?graph=3d', '#graph=2d')).toBe('3d')
  })

  it('falls through to default for unknown values', () => {
    expect(parseGraphMode('?graph=sigma', '')).toBe('3d')
    expect(parseGraphMode('', '#graph=cosmos')).toBe('3d')
  })
})
