import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OpenGraphDBClient } from "../client.js";

export function registerDrillIntoCommunity(
  server: McpServer,
  client: OpenGraphDBClient
): void {
  server.tool(
    "drill_into_community",
    "Drill into a specific community to see its sub-communities or member nodes. If the community has sub-clusters, returns them. If it is a leaf community, returns its member nodes with properties. Use after browse_communities to navigate deeper.",
    {
      community_id: z
        .number()
        .describe(
          "The community ID to drill into (from browse_communities results)"
        ),
      resolutions: z
        .array(z.number())
        .optional()
        .describe("Leiden resolution parameters (default: [1.0, 0.5])"),
    },
    async ({ community_id, resolutions }) => {
      try {
        const result = await client.ragDrillIntoCommunity(
          community_id,
          resolutions
        );
        let summary: string;
        if (result.SubCommunities && result.SubCommunities.length > 0) {
          summary =
            `Community ${community_id} has ${result.SubCommunities.length} sub-communities:\n\n` +
            result.SubCommunities.map(
              (c, i) =>
                `${i + 1}. Community ${c.community_id} (${c.node_count} nodes): ${c.description}`
            ).join("\n");
        } else if (result.Members && result.Members.length > 0) {
          summary =
            `Community ${community_id} is a leaf community with ${result.Members.length} member nodes:\n\n` +
            result.Members.map(
              (m, i) => `${i + 1}. Node ${m.node_id} [${m.labels.join(", ")}]`
            ).join("\n");
        } else {
          summary = `Community ${community_id} not found or is empty.`;
        }
        return {
          content: [
            { type: "text", text: summary },
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Error drilling into community: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
