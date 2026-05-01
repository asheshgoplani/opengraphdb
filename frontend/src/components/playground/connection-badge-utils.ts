export function formatQueryTime(queryTimeMs: number, isLive: boolean): string {
  if (queryTimeMs < 1) {
    return isLive ? '<1ms' : '<1ms (in-memory)'
  }
  return isLive ? `${Math.round(queryTimeMs)}ms` : `${Math.round(queryTimeMs)}ms (in-memory)`
}
