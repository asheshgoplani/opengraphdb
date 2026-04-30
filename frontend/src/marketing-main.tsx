import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from '@/components/ThemeProvider'
import { MarketingRouter } from './MarketingRouter'

// S6: marketing build entry — landing page only. No QueryClient (no /api
// calls on the public site), no WebGL filter (no graph canvas), no
// palette debug hooks. ThemeProvider stays so the system dark preference
// still flips the root class for visitors who land on the public page.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <MarketingRouter />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)
