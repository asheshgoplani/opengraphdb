import { useEffect, type ReactNode } from 'react'
import { useSettingsStore } from '@/stores/settings'
import { resolveTheme } from '@/components/layout/theme-utils'

interface ThemeProviderProps {
  children: ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const theme = useSettingsStore((s) => s.theme)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const root = document.documentElement
    const applyTheme = (isSystemDark: boolean) => {
      const resolvedTheme = resolveTheme(theme, isSystemDark)
      root.classList.remove('light', 'dark')
      root.classList.add(resolvedTheme)
    }

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      applyTheme(mq.matches)

      const handler = (e: MediaQueryListEvent) => {
        applyTheme(e.matches)
      }
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    } else {
      applyTheme(false)
    }
  }, [theme])

  return <>{children}</>
}
