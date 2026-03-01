import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { ApiClient } from './client'
import { useSettingsStore } from '@/stores/settings'

function useApiClient(): ApiClient {
  const serverUrl = useSettingsStore((s) => s.serverUrl)
  return useMemo(() => new ApiClient(serverUrl), [serverUrl])
}

export function useHealthCheck() {
  const client = useApiClient()
  const serverUrl = useSettingsStore((s) => s.serverUrl)
  return useQuery({
    queryKey: ['health', serverUrl],
    queryFn: () => client.health(),
    refetchInterval: 5000,
    retry: false,
    placeholderData: { connected: false },
  })
}

export function useCypherQuery() {
  const client = useApiClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (cypher: string) => client.query(cypher),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health'] })
    },
  })
}
