import { useEffect, useMemo, useState } from 'react'
import { useSettingsStore } from '@/stores/settings'
import { resolveTheme } from '@/components/layout/theme-utils'

export interface CanvasColors {
  bg: string
  text: string
  edge: string
  border: string
  nodeText: string
}

function useResolvedTheme(): 'light' | 'dark' {
  const theme = useSettingsStore((s) => s.theme)
  const [isSystemDark, setIsSystemDark] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || theme !== 'system') return

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    setIsSystemDark(mq.matches)

    const handler = (event: MediaQueryListEvent) => {
      setIsSystemDark(event.matches)
    }

    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  return resolveTheme(theme, isSystemDark)
}

export function useGraphColors(): CanvasColors {
  const resolved = useResolvedTheme()

  return useMemo(() => {
    if (resolved === 'dark') {
      return {
        bg: '#1a1a2e',
        text: '#e0e0e0',
        edge: '#4a4a6a',
        border: '#2a2a4e',
        nodeText: '#e0e0e0',
      }
    }
    return {
      bg: '#ffffff',
      text: '#1a1a1a',
      edge: '#cccccc',
      border: '#e0e0e0',
      nodeText: '#1a1a1a',
    }
  }, [resolved])
}
