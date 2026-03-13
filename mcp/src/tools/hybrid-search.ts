import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OpenGraphDBClient } from "../client.js";

export function registerHybridSearch(
  server: McpServer,
  client: OpenGraphDBClient
): void {
  server.tool(
    "hybrid_search",
    "Search the graph using hybrid retrieval combining BM25 text search, vector similarity, and graph traversal via Reciprocal Rank Fusion (RRF). Returns enriched results with node properties. More accurate than any single retrieval method alone.",
    {
      query: z.string().describe("Natural language search query"),
      embedding: z
        .array(z.number())
        .optional()
        .describe(
          "Query embedding vector (if omitted, uses BM25 and graph signals only)"
        ),
      k: z
        .number()
        .optional()
        .default(10)
        .describe("Number of results to return (default: 10)"),
      community_id: z
        .number()
        .optional()
        .describe(
          "Restrict search to a specific community (from browse_communities)"
        ),
    },
    async ({ query, embedding, k, community_id }) => {
      try {
        const results = await client.ragHybridSearch(query, {
          embedding,
          k,
          community_id,
        });
        const summary =
          results.length === 0
            ? "No results found for the query."
            : `Found ${results.length} results:\n\n` +
              results
                .map((r, i) => {
                  const title = r.properties?.title;
                  const text = r.properties?.text;
                  let line = `${i + 1}. Node ${r.node_id} [${r.labels.join(", ")}] (score: ${r.score.toFixed(4)})`;
                  if (title) line += ` — ${title}`;
                  if (text)
                    line += `\n   ${String(text).slice(0, 200)}...`;
                  return line;
                })
                .join("\n");
        return {
          content: [
            { type: "text", text: summary },
            { type: "text", text: JSON.stringify(results, null, 2) },
          ],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          content: [
            { type: "text", text: `Error performing hybrid search: ${msg}` },
          ],
          isError: true,
        };
      }
    }
  );
}
