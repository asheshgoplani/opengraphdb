import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/stores/settings'
import { Sun, Moon, Monitor } from 'lucide-react'

export function ThemeToggle() {
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)

  const cycleTheme = () => {
    const order = ['system', 'light', 'dark'] as const
    const current = order.indexOf(theme)
    const next = order[(current + 1) % order.length]
    setTheme(next)
  }

  const Icon = theme === 'dark' ? Sun : theme === 'light' ? Moon : Monitor

  return (
    <Button variant="ghost" size="icon" onClick={cycleTheme} title={`Theme: ${theme}`}>
      <Icon className="h-4 w-4" />
    </Button>
  )
}
