import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OpenGraphDBClient } from "../client.js";
import { z } from "zod";

export function registerGetNodeNeighborhood(server: McpServer, client: OpenGraphDBClient): void {
  server.tool(
    "get_node_neighborhood",
    "Explore the neighborhood around a specific node. Returns connected nodes and relationships within the specified hop distance. Use this to understand how a node relates to the rest of the graph.",
    {
      node_id: z.number().int().nonnegative().describe("The internal node ID to explore around"),
      hops: z.number().int().min(1).max(5).default(1).describe("Number of hops to expand (1-5, default 1)"),
      edge_type: z.string().optional().describe("Optional: filter to only this relationship type"),
      limit: z.number().int().min(1).max(500).default(50).describe("Maximum number of result rows (default 50)"),
    },
    async ({ node_id, hops, edge_type, limit }) => {
      try {
        // Build Cypher query for N-hop neighborhood expansion
        const hopRange = hops === 1 ? "" : `*1..${hops}`;
        const relFilter = edge_type ? `:${edge_type}` : "";
        const cypher = `MATCH (center)-[r${relFilter}${hopRange}]-(neighbor) WHERE id(center) = ${node_id} RETURN center, r, neighbor LIMIT ${limit}`;

        const result = await client.query(cypher);
        const rowCount = Array.isArray(result.rows) ? result.rows.length : 0;
        const summary = `Neighborhood of node ${node_id} (${hops} hop${hops > 1 ? "s" : ""}): ${rowCount} connection(s) found${edge_type ? ` (filtered by :${edge_type})` : ""}`;

        return {
          content: [
            { type: "text", text: summary },
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error exploring neighborhood: ${msg}` }],
          isError: true,
        };
      }
    }
  );
}
