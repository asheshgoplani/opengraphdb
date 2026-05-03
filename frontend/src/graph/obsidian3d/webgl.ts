// WebGL feature detection — gates the c14 react-force-graph-3d renderer
// against the legacy 2D ObsidianGraph fallback. Centralises the
// "is WebGL usable" check so:
//   * GraphCanvas can decide which renderer to mount.
//   * Tests can drive the helper through an injectable factory (the
//     real DOM `document.createElement('canvas')` isn't available under
//     vitest's node environment).
//
// We accept either WebGL2 (preferred — RFG3D's three.js dep targets
// WebGL2 paths first) or WebGL1 (sufficient for our usage; three.js
// downgrades silently). A throwing `getContext` (seen in some
// enterprise-locked Chromium builds) is treated as "no WebGL" rather
// than as a crash, so the playground still loads in degraded mode.

export type CanvasFactory = () => HTMLCanvasElement | null

function defaultFactory(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  return document.createElement('canvas')
}

export function detectWebGL(factory: CanvasFactory = defaultFactory): boolean {
  const canvas = factory()
  if (!canvas) return false
  try {
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

let _cached: boolean | null = null

// Module-level cache so we only pay the canvas-creation cost once per
// page load. GraphCanvas may render multiple times per session as
// PlaygroundPage swaps datasets; the underlying GPU capability does
// not change mid-session, so caching is safe.
export function hasWebGL(): boolean {
  if (_cached != null) return _cached
  _cached = detectWebGL()
  return _cached
}
