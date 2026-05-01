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
