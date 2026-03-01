import { ConnectionStatus } from './ConnectionStatus'
import { Link } from 'react-router-dom'
import { SchemaPanel } from '@/components/schema/SchemaPanel'
import { QueryHistoryPanel } from '@/components/query/QueryHistoryPanel'
import { SavedQueriesPanel } from '@/components/query/SavedQueriesPanel'
import { ThemeToggle } from './ThemeToggle'
import { SettingsDialog } from './SettingsDialog'

export function Header() {
  return (
    <header className="flex h-12 items-center justify-between border-b bg-card px-3 sm:px-4">
      <Link to="/" className="text-base font-semibold sm:text-lg hover:text-foreground/80 transition-colors">OpenGraphDB</Link>
      <div className="flex items-center gap-2">
        <ConnectionStatus />
        <SchemaPanel />
        <QueryHistoryPanel />
        <SavedQueriesPanel />
        <ThemeToggle />
        <SettingsDialog />
      </div>
    </header>
  )
}
