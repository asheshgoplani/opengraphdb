import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OpenGraphDBClient } from "../client.js";
import { z } from "zod";

export function registerSearchNodes(server: McpServer, client: OpenGraphDBClient): void {
  server.tool(
    "search_nodes",
    "Search for nodes by matching text against their properties. Finds nodes where any string property contains the search term (case-insensitive). Optionally filter by label.",
    {
      query: z.string().describe("Text to search for in node properties"),
      label: z.string().optional().describe("Optional: filter to only nodes with this label"),
      limit: z.number().int().min(1).max(200).default(25).describe("Maximum results (default 25)"),
    },
    async ({ query, label, limit }) => {
      try {
        // Get schema to know which properties to search
        const schema = await client.schema();
        const stringProps = schema.property_keys.filter(
          (k) => !k.startsWith("_") && !["embedding", "vector"].includes(k)
        );

        if (stringProps.length === 0) {
          return {
            content: [{ type: "text", text: "No searchable string properties found in the schema." }],
          };
        }

        // Build WHERE clause that checks multiple properties
        const labelFilter = label ? `:${label}` : "";
        const whereClauses = stringProps
          .slice(0, 10) // Cap at 10 properties to keep the query manageable
          .map((prop) => `toString(n.${prop}) CONTAINS $searchTerm`)
          .join(" OR ");

        // Use a parameterized-style approach via string interpolation
        // (OpenGraphDB Cypher may not support $params via HTTP yet, so inline the value safely)
        const escapedQuery = query.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        const cypher = `MATCH (n${labelFilter}) WHERE ${whereClauses} RETURN n LIMIT ${limit}`;

        // Since OpenGraphDB may not support $params in HTTP POST /query,
        // we replace $searchTerm with the literal value
        const finalCypher = cypher.replace(/\$searchTerm/g, `'${escapedQuery}'`);

        const result = await client.query(finalCypher);
        const rowCount = Array.isArray(result.rows) ? result.rows.length : 0;
        const summary = `Found ${rowCount} node(s) matching "${query}"${label ? ` with label :${label}` : ""}`;

        return {
          content: [
            { type: "text", text: summary },
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error searching nodes: ${msg}` }],
          isError: true,
        };
      }
    }
  );
}
