import { MCPToolCard } from './MCPToolCard'
import { ALL_MCP_TOOLS, REAL_MCP_TOOLS } from './mcpTools'

export function MCPToolGallery() {
  const realCount = REAL_MCP_TOOLS.length
  const soonCount = ALL_MCP_TOOLS.length - realCount
  return (
    <section
      data-testid="mcp-tool-gallery"
      className="rounded-lg border border-white/10 bg-muted/30 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="font-serif text-[17px] leading-none tracking-tight text-foreground">
          MCP Tools
        </h2>
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-cyan-300/80">
          {realCount} live · {soonCount} soon
        </p>
      </div>
      <p className="mb-3 text-[11px] leading-snug text-white/55">
        Built-in Model Context Protocol server — every card here is a JSON-RPC tool any AI agent
        (Claude, Cursor, Copilot) can invoke.
      </p>
      <div className="grid gap-2">
        {ALL_MCP_TOOLS.map((spec) => (
          <MCPToolCard key={spec.name} spec={spec} />
        ))}
      </div>
    </section>
  )
}
