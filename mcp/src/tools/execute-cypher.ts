import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OpenGraphDBClient } from "../client.js";
import { z } from "zod";

export function registerExecuteCypher(server: McpServer, client: OpenGraphDBClient): void {
  server.tool(
    "execute_cypher",
    "Execute an openCypher query against the OpenGraphDB database. Returns structured results with columns and rows. Use LIMIT to control result size. Supports MATCH, CREATE, MERGE, DELETE, SET, and all standard Cypher clauses.",
    {
      query: z.string().describe("The Cypher query to execute (e.g., 'MATCH (n:Movie) RETURN n.title LIMIT 10')"),
    },
    async ({ query }) => {
      try {
        const result = await client.query(query);
        const rowCount = Array.isArray(result.rows) ? result.rows.length : 0;
        const summary = `Query returned ${rowCount} row(s) with columns: ${
          Array.isArray(result.columns) ? result.columns.join(", ") : "(none)"
        }`;
        return {
          content: [
            { type: "text", text: summary },
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error executing query: ${msg}` }],
          isError: true,
        };
      }
    }
  );
}
