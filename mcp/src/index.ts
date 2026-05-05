#!/usr/bin/env node

// Public library re-exports — keeps `import { OpenGraphDBClient } from "@opengraphdb/mcp"`
// (and its companion type interfaces) working for downstream consumers,
// matching the shape the marketing snippet in
// frontend/src/components/landing/AIIntegrationSection.tsx promises.
// EVAL-FRONTEND-CYCLE32 BLOCKER-1.
export { OpenGraphDBClient } from "./client.js";
export type {
  CommunitySummaryResponse,
  DrillResultResponse,
  EnrichedRagResultResponse,
  IngestResultResponse,
  SchemaResponse,
  MetricsResponse,
  QueryResponse,
} from "./client.js";

import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { OpenGraphDBClient } from "./client.js";
import { registerBrowseSchema } from "./tools/browse-schema.js";
import { registerExecuteCypher } from "./tools/execute-cypher.js";
import { registerGetNodeNeighborhood } from "./tools/get-node-neighborhood.js";
import { registerSearchNodes } from "./tools/search-nodes.js";
import { registerListDatasets } from "./tools/list-datasets.js";
import { registerBrowseCommunities } from "./tools/browse-communities.js";
import { registerDrillIntoCommunity } from "./tools/drill-into-community.js";
import { registerHybridSearch } from "./tools/hybrid-search.js";
import { registerIngestDocument } from "./tools/ingest-document.js";

const DEFAULT_URL = "http://localhost:8080";

async function main(): Promise<void> {
  const url = process.env.OGDB_URL ?? DEFAULT_URL;

  const client = new OpenGraphDBClient(url);
  const server = new McpServer({
    name: "opengraphdb",
    version: "0.1.0",
  });

  // Register all tools
  registerBrowseSchema(server, client);
  registerExecuteCypher(server, client);
  registerGetNodeNeighborhood(server, client);
  registerSearchNodes(server, client);
  registerListDatasets(server, client);

  // Register RAG tools
  registerBrowseCommunities(server, client);
  registerDrillIntoCommunity(server, client);
  registerHybridSearch(server, client);
  registerIngestDocument(server, client);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Run the stdio server only when this module is executed directly (e.g.
// via the `opengraphdb-mcp` bin shim). A library import like
// `import { OpenGraphDBClient } from "@opengraphdb/mcp"` must NOT hijack
// the consumer's stdin/stdout. The realpath dance survives npm's bin
// symlink (node_modules/.bin/opengraphdb-mcp → ../@opengraphdb/mcp/dist/index.js)
// where Node resolves import.meta.url through realpath but leaves
// process.argv[1] pointing at the symlink. EVAL-FRONTEND-CYCLE32 BLOCKER-1.
function isDirectExecution(): boolean {
  if (typeof process === "undefined" || !process.argv || !process.argv[1]) {
    return false;
  }
  try {
    return (
      realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  main().catch((error) => {
    process.stderr.write(`Fatal: ${error}\n`);
    process.exit(1);
  });
}
