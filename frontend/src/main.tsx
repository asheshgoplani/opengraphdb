import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from '@/components/ThemeProvider'
import { AppRouter } from './AppRouter'
import { NODE_PALETTE_LIST } from '@/graph/theme'
import './index.css'

// Slice-15: DOM/JS introspection surfaces for E2E verification. WebGL pixel
// sampling is unreliable under SwiftShader-headless, so the slice-15 gates
// assert the data the canvas renders FROM:
//   - window.__NODE_PALETTE   : structured node-color catalogue (from theme)
//   - window.__COSMOS_DEBUG   : map populated by CosmosCanvas with the
//                               per-edge-type color map actually handed to
//                               linkColorByFn. CosmosCanvas is the writer.
type NodePaletteWindow = Window & {
  __NODE_PALETTE?: typeof NODE_PALETTE_LIST
  __COSMOS_DEBUG?: { edgeColors?: Record<string, unknown> }
}
const w = window as NodePaletteWindow
w.__NODE_PALETTE = NODE_PALETTE_LIST
if (!w.__COSMOS_DEBUG) w.__COSMOS_DEBUG = {}

// M4 (audit 2026-04-23b): Chromium + SwiftShader fire
//   [.WebGL-*] GPU stall due to ReadPixels (this message will no longer repeat)
// on first-paint of the MapLibre/deck.gl GeoCanvas warmup. It is benign
// (deck.gl reads back a single pixel to test framebuffer readiness) and
// browsers self-suppress after the first occurrence per context, but with
// React StrictMode double-mounting and per-route context re-creation it
// still fills the dev console and distracts during audits. Swallow only
// this specific string from console.warn/console.error/console.log; any
// other WebGL message (actual errors, shader-compile failures) passes through.
if (typeof window !== 'undefined' && !('__OGDB_GL_FILTER__' in w)) {
  ;(w as unknown as { __OGDB_GL_FILTER__: true }).__OGDB_GL_FILTER__ = true
  const WEBGL_READPIXELS_STALL = /GPU stall due to ReadPixels/i
  const wrap = (orig: (...args: unknown[]) => void) =>
    function filtered(...args: unknown[]) {
      if (args.length > 0 && typeof args[0] === 'string' && WEBGL_READPIXELS_STALL.test(args[0])) {
        return
      }
      orig.apply(console, args)
    }
  console.warn = wrap(console.warn.bind(console))
  console.error = wrap(console.error.bind(console))
  console.log = wrap(console.log.bind(console))
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
