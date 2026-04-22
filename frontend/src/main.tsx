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
