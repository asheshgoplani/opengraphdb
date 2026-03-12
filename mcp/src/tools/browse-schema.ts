import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OpenGraphDBClient } from "../client.js";

export function registerBrowseSchema(server: McpServer, client: OpenGraphDBClient): void {
  server.tool(
    "browse_schema",
    "Discover all node labels, relationship types, and property keys in the OpenGraphDB database. Call this first to understand the graph structure before writing queries.",
    {},
    async () => {
      try {
        const schema = await client.schema();
        const summary = [
          `Node Labels (${schema.labels.length}): ${schema.labels.join(", ") || "(none)"}`,
          `Relationship Types (${schema.edge_types.length}): ${schema.edge_types.join(", ") || "(none)"}`,
          `Property Keys (${schema.property_keys.length}): ${schema.property_keys.join(", ") || "(none)"}`,
        ].join("\n");
        return {
          content: [
            { type: "text", text: summary },
            { type: "text", text: JSON.stringify(schema, null, 2) },
          ],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error fetching schema: ${msg}` }],
          isError: true,
        };
      }
    }
  );
}
