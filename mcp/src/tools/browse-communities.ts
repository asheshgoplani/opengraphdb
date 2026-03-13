import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OpenGraphDBClient } from "../client.js";

export function registerBrowseCommunities(
  server: McpServer,
  client: OpenGraphDBClient
): void {
  server.tool(
    "browse_communities",
    "Browse top-level graph communities with descriptions. Returns a PageIndex-style table of contents showing community clusters sorted by size. Use this to understand the graph's high-level structure before drilling into specific areas.",
    {
      resolutions: z
        .array(z.number())
        .optional()
        .describe(
          "Leiden resolution parameters controlling community granularity (default: [1.0, 0.5]). Higher values produce more communities."
        ),
    },
    async ({ resolutions }) => {
      try {
        const communities = await client.ragBrowseCommunities(resolutions);
        const summary =
          communities.length === 0
            ? "No communities found. The graph may be empty or too small for community detection."
            : `Found ${communities.length} top-level communities:\n\n` +
              communities
                .map(
                  (c, i) =>
                    `${i + 1}. Community ${c.community_id} (${c.node_count} nodes, ${c.edge_count} edges): ${c.description}`
                )
                .join("\n");
        return {
          content: [
            { type: "text", text: summary },
            { type: "text", text: JSON.stringify(communities, null, 2) },
          ],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          content: [
            { type: "text", text: `Error browsing communities: ${msg}` },
          ],
          isError: true,
        };
      }
    }
  );
}
