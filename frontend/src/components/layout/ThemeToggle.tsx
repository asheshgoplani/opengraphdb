import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/stores/settings'
import { Sun, Moon, Monitor } from 'lucide-react'
import { getNextTheme } from './theme-utils'

export function ThemeToggle() {
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)

  const cycleTheme = () => {
    setTheme(getNextTheme(theme))
  }

  const Icon = theme === 'dark' ? Sun : theme === 'light' ? Moon : Monitor

  return (
    <Button variant="ghost" size="icon" onClick={cycleTheme} title={`Theme: ${theme}`}>
      <Icon className="h-4 w-4" />
    </Button>
  )
}
