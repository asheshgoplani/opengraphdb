export type MCPInvokeArgs = Record<string, unknown>

export type MCPInvokeResult =
  | { source: 'live'; tool: string; elapsedMs: number; result: unknown }
  | { source: 'preview'; tool: string; elapsedMs: number; result: unknown; reason: string }
  | { source: 'error'; tool: string; elapsedMs: number; reason: string }

// POSTs to a local dev proxy that spawns `opengraphdb mcp --request <json>`.
// Three outcomes are surfaced verbatim so the UI can render an honest badge:
//   - 2xx + JSON parse OK           → source: 'live'
//   - fetch fails + preview given   → source: 'preview' (canned fallback, NOT a success)
//   - fetch fails + no preview      → source: 'error'
export async function invokeMcpTool(
  tool: string,
  args: MCPInvokeArgs,
  preview: unknown,
  baseUrl = '/api',
): Promise<MCPInvokeResult> {
  const start = performance.now()
  try {
    const res = await fetch(`${baseUrl}/mcp/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, arguments: args }),
      signal: AbortSignal.timeout(2500),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    return {
      source: 'live',
      tool,
      elapsedMs: Math.round(performance.now() - start),
      result: body,
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    const elapsedMs = Math.round(performance.now() - start)
    if (preview !== null && preview !== undefined) {
      return { source: 'preview', tool, elapsedMs, result: preview, reason }
    }
    return { source: 'error', tool, elapsedMs, reason }
  }
}
