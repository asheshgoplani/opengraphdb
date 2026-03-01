import { Database, Wifi } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface LiveModeToggleProps {
  isLive: boolean
  onChange: (isLive: boolean) => void
  disabled?: boolean
}

export function LiveModeToggle({ isLive, onChange, disabled }: LiveModeToggleProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-0.5" data-testid="live-mode-toggle">
      <Button
        type="button"
        variant={isLive ? 'ghost' : 'secondary'}
        size="sm"
        className="h-6 gap-1 px-2 text-xs"
        aria-pressed={!isLive}
        onClick={() => onChange(false)}
        disabled={disabled}
      >
        <Database className="h-3 w-3" />
        Sample
      </Button>
      <Button
        type="button"
        variant={isLive ? 'secondary' : 'ghost'}
        size="sm"
        className="h-6 gap-1 px-2 text-xs"
        aria-pressed={isLive}
        onClick={() => onChange(true)}
        disabled={disabled}
      >
        <Wifi className="h-3 w-3" />
        Live
      </Button>
    </div>
  )
}
