import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OpenGraphDBClient } from "../client.js";

export function registerListDatasets(server: McpServer, client: OpenGraphDBClient): void {
  server.tool(
    "list_datasets",
    "List all datasets loaded in the database with their node counts, edge counts, labels, and relationship types. Gives a high-level overview of what data is available.",
    {},
    async () => {
      try {
        const [schema, metrics] = await Promise.all([
          client.schema(),
          client.metrics(),
        ]);

        const summary = [
          "=== OpenGraphDB Database Overview ===",
          "",
          `Total Nodes: ${metrics.node_count}`,
          `Total Edges: ${metrics.edge_count}`,
          "",
          `Node Labels (${schema.labels.length}):`,
          ...schema.labels.map((l) => `  - :${l}`),
          "",
          `Relationship Types (${schema.edge_types.length}):`,
          ...schema.edge_types.map((t) => `  - :${t}`),
          "",
          `Property Keys (${schema.property_keys.length}):`,
          ...schema.property_keys.map((k) => `  - ${k}`),
        ].join("\n");

        return {
          content: [
            { type: "text", text: summary },
            {
              type: "text",
              text: JSON.stringify(
                {
                  node_count: metrics.node_count,
                  edge_count: metrics.edge_count,
                  labels: schema.labels,
                  edge_types: schema.edge_types,
                  property_keys: schema.property_keys,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error listing datasets: ${msg}` }],
          isError: true,
        };
      }
    }
  );
}
