// Pins the Obsidian3D WebGL feature-detect that gates whether
// GraphCanvas mounts the WebGL renderer or falls back to the legacy
// 2D ObsidianGraph. Runs in node (no real WebGL context) so we drive
// the helper through an injectable `createCanvas` factory — the
// production module reads window.document.createElement under the hood,
// but tests can stub it to simulate "WebGL unavailable" and "WebGL OK".
import { describe, expect, it } from 'vitest'
import { detectWebGL } from '../src/graph/obsidian3d/webgl'

describe('detectWebGL', () => {
  it('returns false when no canvas factory is available (SSR / node)', () => {
    expect(detectWebGL(() => null)).toBe(false)
  })

  it('returns false when canvas.getContext returns null for both webgl forms', () => {
    const canvas = {
      getContext: () => null,
    }
    expect(detectWebGL(() => canvas as unknown as HTMLCanvasElement)).toBe(false)
  })

  it('returns true when canvas.getContext("webgl2") returns a context', () => {
    const canvas = {
      getContext: (type: string) => (type === 'webgl2' ? ({} as WebGL2RenderingContext) : null),
    }
    expect(detectWebGL(() => canvas as unknown as HTMLCanvasElement)).toBe(true)
  })

  it('returns true when only the legacy "webgl" context is available', () => {
    const canvas = {
      getContext: (type: string) => (type === 'webgl' ? ({} as WebGLRenderingContext) : null),
    }
    expect(detectWebGL(() => canvas as unknown as HTMLCanvasElement)).toBe(true)
  })

  it('survives a getContext that throws (some locked-down browsers)', () => {
    const canvas = {
      getContext: () => {
        throw new Error('webgl blocked by enterprise policy')
      },
    }
    expect(detectWebGL(() => canvas as unknown as HTMLCanvasElement)).toBe(false)
  })
})
