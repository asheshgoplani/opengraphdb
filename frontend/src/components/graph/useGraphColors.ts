import { useMemo } from 'react'
import { useSettingsStore } from '@/stores/settings'

export interface CanvasColors {
  bg: string
  text: string
  edge: string
  border: string
  nodeText: string
}

function useResolvedTheme(): 'light' | 'dark' {
  const theme = useSettingsStore((s) => s.theme)
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }
  return theme
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
