import { useEffect, useMemo, useState } from 'react'
import { useSettingsStore } from '@/stores/settings'
import { resolveTheme } from '@/components/layout/theme-utils'
import type { CanvasColors } from './canvasColors'
export type { CanvasColors } from './canvasColors'

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
        bg: '#0f0f1a',
        text: '#e2e8f0',
        edge: '#334155',
        border: '#1e293b',
        nodeText: '#f1f5f9',
        gridDot: '#1e293b',
        nodeShadow: 'rgba(99, 102, 241, 0.3)',
        edgeLabel: '#94a3b8',
        edgeLabelBg: 'rgba(15, 15, 26, 0.85)',
        traceGlow: '#00d4ff',
        dimmedAlpha: 0.15,
      }
    }
    return {
      bg: '#fafbfc',
      text: '#0f172a',
      edge: '#cbd5e1',
      border: '#e2e8f0',
      nodeText: '#1e293b',
      gridDot: '#e2e8f0',
      nodeShadow: 'rgba(99, 102, 241, 0.15)',
      edgeLabel: '#64748b',
      edgeLabelBg: 'rgba(250, 251, 252, 0.85)',
      traceGlow: '#0088cc',
      dimmedAlpha: 0.25,
    }
  }, [resolved])
}
