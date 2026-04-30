import { useHealthCheck } from '@/api/queries'
import { useSettingsStore } from '@/stores/settings'

type ConnectionStatusVariant = 'connecting' | 'connected' | 'disconnected'

interface ConnectionStatusModelInput {
  isConnecting: boolean
  isConnected: boolean
  serverUrl: string
}

interface ConnectionStatusModel {
  variant: ConnectionStatusVariant
  statusText: string
  serverLabel: string | null
}

function toServerLabel(serverUrl: string): string {
  try {
    return new URL(serverUrl).host
  } catch {
    return serverUrl.replace(/^https?:\/\//, '')
  }
}

export function getConnectionStatusModel({
  isConnecting,
  isConnected,
  serverUrl,
}: ConnectionStatusModelInput): ConnectionStatusModel {
  if (isConnecting) {
    return {
      variant: 'connecting',
      statusText: 'Connecting...',
      serverLabel: null,
    }
  }

  if (isConnected) {
    return {
      variant: 'connected',
      statusText: 'Connected',
      serverLabel: toServerLabel(serverUrl),
    }
  }

  return {
    variant: 'disconnected',
    statusText: 'Disconnected',
    serverLabel: null,
  }
}

export function ConnectionStatus() {
  const { data, isLoading, isFetching } = useHealthCheck()
  const serverUrl = useSettingsStore((s) => s.serverUrl)

  const model = getConnectionStatusModel({
    isConnecting: isLoading || isFetching,
    isConnected: data?.connected ?? false,
    serverUrl,
  })

  return (
    <div className="flex items-center gap-2 rounded-full border bg-background/60 px-3 py-1 text-xs">
      {model.variant === 'connected' ? (
        <span className="relative flex h-2 w-2">
          <span className="absolute h-full w-full animate-ping rounded-full bg-accent opacity-75" />
          <span className="relative h-2 w-2 rounded-full bg-accent" />
        </span>
      ) : model.variant === 'disconnected' ? (
        <span className="h-2 w-2 rounded-full bg-destructive" />
      ) : (
        <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
      )}
      <span className="font-medium text-foreground">{model.statusText}</span>
      {model.serverLabel ? (
        <span className="hidden text-muted-foreground sm:inline">· {model.serverLabel}</span>
      ) : null}
    </div>
  )
}
