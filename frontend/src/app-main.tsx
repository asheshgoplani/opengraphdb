import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from '@/components/ThemeProvider'
import { AppShellRouter } from './AppShellRouter'
import { NODE_PALETTE_LIST } from '@/graph/theme'

// S6: embedded-app build entry — playground/claims/app shell. Mirrors the
// provider tree from main.tsx (QueryClient, ThemeProvider, palette debug
// hooks, WebGL ReadPixels-stall filter) so the playground continues to
// work the same when served from the embedded SPA in S7.
type NodePaletteWindow = Window & {
  __NODE_PALETTE?: typeof NODE_PALETTE_LIST
  __COSMOS_DEBUG?: { edgeColors?: Record<string, unknown> }
}
const w = window as NodePaletteWindow
w.__NODE_PALETTE = NODE_PALETTE_LIST
if (!w.__COSMOS_DEBUG) w.__COSMOS_DEBUG = {}

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
          <AppShellRouter />
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
