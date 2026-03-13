#!/usr/bin/env node

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

main().catch((error) => {
  process.stderr.write(`Fatal: ${error}\n`);
  process.exit(1);
});
