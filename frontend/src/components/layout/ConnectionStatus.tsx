import { useHealthCheck } from '@/api/queries'
import { cn } from '@/lib/utils'

export function ConnectionStatus() {
  const { data, isLoading, isFetching } = useHealthCheck()

  const isConnecting = isLoading || isFetching
  const isConnected = data?.connected ?? false

  const dotColor = isConnecting
    ? 'bg-amber-500 animate-pulse'
    : isConnected
      ? 'bg-green-500'
      : 'bg-red-500'

  const statusText = isConnecting
    ? 'Connecting...'
    : isConnected
      ? 'Connected'
      : 'Disconnected'

  return (
    <div className="flex items-center gap-1.5">
      <div className={cn('w-2.5 h-2.5 rounded-full', dotColor)} />
      <span className="text-xs text-muted-foreground hidden sm:inline">
        {statusText}
      </span>
    </div>
  )
}
