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
    <header className="border-b border-border/60 bg-card/85 backdrop-blur-md">
      <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-base font-semibold tracking-tight text-foreground transition-colors hover:text-foreground/85"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted/60 text-foreground">
              <Share2 className="h-4 w-4" />
            </span>
            <span className="font-display text-lg font-medium tracking-tight">
              OpenGraphDB
            </span>
          </Link>
          <Badge
            variant="secondary"
            className="rounded-full border-border bg-muted/60 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-foreground/85"
          >
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
