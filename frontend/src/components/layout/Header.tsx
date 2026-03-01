import { ConnectionStatus } from './ConnectionStatus'
import { ThemeToggle } from './ThemeToggle'
import { SettingsDialog } from './SettingsDialog'

export function Header() {
  return (
    <header className="h-12 border-b bg-card flex items-center justify-between px-4">
      <div className="font-semibold text-lg">OpenGraphDB</div>
      <div className="flex items-center gap-2">
        <ConnectionStatus />
        <ThemeToggle />
        <SettingsDialog />
      </div>
    </header>
  )
}
