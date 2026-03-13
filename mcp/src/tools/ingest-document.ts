import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OpenGraphDBClient } from "../client.js";

export function registerIngestDocument(
  server: McpServer,
  client: OpenGraphDBClient
): void {
  server.tool(
    "ingest_document",
    "Ingest a document (Markdown or plain text) into the graph database. Creates :Document, :Section, and :Content nodes with containment edges, cross-reference edges, and full-text indexes. Use this to add knowledge to the graph for later retrieval via hybrid_search.",
    {
      title: z.string().describe("Document title"),
      content: z.string().describe("Document content (Markdown or plain text)"),
      format: z
        .enum(["Markdown", "PlainText"])
        .optional()
        .default("Markdown")
        .describe("Document format (default: Markdown)"),
      source_uri: z
        .string()
        .optional()
        .describe("Optional source URI for provenance tracking"),
    },
    async ({ title, content, format, source_uri }) => {
      try {
        const result = await client.ragIngestDocument(title, content, {
          format,
          source_uri,
        });
        const summary = [
          `Document "${title}" ingested successfully:`,
          `  Document node ID: ${result.document_node_id}`,
          `  Sections created: ${result.section_count}`,
          `  Content chunks created: ${result.content_count}`,
          `  Cross-references found: ${result.reference_count}`,
          `  Text indexed: ${result.text_indexed}`,
          `  Vector indexed: ${result.vector_indexed}`,
        ].join("\n");
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
            { type: "text", text: `Error ingesting document: ${msg}` },
          ],
          isError: true,
        };
      }
    }
  );
}
