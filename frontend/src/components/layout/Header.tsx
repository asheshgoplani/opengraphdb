import { ConnectionStatus } from './ConnectionStatus'
import { Link } from 'react-router-dom'
import { SchemaPanel } from '@/components/schema/SchemaPanel'
import { QueryHistoryPanel } from '@/components/query/QueryHistoryPanel'
import { SavedQueriesPanel } from '@/components/query/SavedQueriesPanel'
import { ThemeToggle } from './ThemeToggle'
import { SettingsDialog } from './SettingsDialog'
import { Badge } from '@/components/ui/badge'
import { Share2 } from 'lucide-react'

export function Header() {
  return (
    <header className="border-b bg-card/80 backdrop-blur-sm">
      <div className="flex h-14 items-center justify-between gap-3 px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-base font-semibold tracking-tight transition-colors hover:text-foreground/80 sm:text-lg"
          >
            <span className="rounded-md bg-primary/15 p-1 text-primary">
              <Share2 className="h-4 w-4" />
            </span>
            OpenGraphDB
          </Link>
          <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-[11px] font-medium">
            Explorer
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <ConnectionStatus />
          <div className="hidden h-6 w-px bg-border md:block" aria-hidden="true" />
          <SchemaPanel />
          <QueryHistoryPanel />
          <SavedQueriesPanel />
          <ThemeToggle />
          <SettingsDialog />
        </div>
      </div>
    </header>
  )
}
