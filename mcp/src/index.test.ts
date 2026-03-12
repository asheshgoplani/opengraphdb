import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(__dirname, "..", "dist", "index.js");

interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

function sendRequest(
  proc: ReturnType<typeof spawn>,
  method: string,
  params: Record<string, unknown> = {},
  id = 1
): Promise<JsonRpcResponse> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timeout waiting for MCP response")), 5000);
    let buffer = "";

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      // MCP responses are newline-delimited JSON
      const lines = buffer.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as JsonRpcResponse;
          if (parsed.id === id) {
            clearTimeout(timeout);
            proc.stdout?.removeListener("data", onData);
            resolve(parsed);
            return;
          }
        } catch {
          // Not valid JSON yet, continue buffering
        }
      }
    };

    proc.stdout?.on("data", onData);

    const request = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });
    proc.stdin?.write(request + "\n");
  });
}

function startServer(): ReturnType<typeof spawn> {
  return spawn("node", [SERVER_PATH], {
    env: {
      ...process.env,
      // Use a non-existent URL so tools fail gracefully but server starts
      OGDB_URL: "http://localhost:19999",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
}

describe("MCP Server Protocol", () => {
  it("responds to initialize with server info and capabilities", async () => {
    const proc = startServer();
    try {
      const response = await sendRequest(proc, "initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "0.1.0" },
      });

      assert.equal(response.jsonrpc, "2.0");
      assert.ok(response.result, "Expected result in response");
      assert.ok(response.result.serverInfo, "Expected serverInfo");
      const serverInfo = response.result.serverInfo as Record<string, string>;
      assert.equal(serverInfo.name, "opengraphdb");
      assert.ok(response.result.capabilities, "Expected capabilities");
    } finally {
      proc.kill();
    }
  });

  it("lists all 5 required tools", async () => {
    const proc = startServer();
    try {
      // Must initialize first
      await sendRequest(proc, "initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "0.1.0" },
      }, 1);

      // Send initialized notification (no response expected)
      proc.stdin?.write(JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }) + "\n");

      const response = await sendRequest(proc, "tools/list", {}, 2);

      assert.ok(response.result, "Expected result");
      const tools = response.result.tools as Array<{ name: string; description: string }>;
      assert.ok(Array.isArray(tools), "Expected tools array");

      const toolNames = tools.map((t) => t.name);
      const requiredTools = [
        "browse_schema",
        "execute_cypher",
        "get_node_neighborhood",
        "search_nodes",
        "list_datasets",
      ];

      for (const required of requiredTools) {
        assert.ok(
          toolNames.includes(required),
          `Missing required tool: ${required}. Available: ${toolNames.join(", ")}`
        );
      }

      // Verify descriptions are non-empty
      for (const tool of tools) {
        assert.ok(tool.description, `Tool ${tool.name} has empty description`);
        assert.ok(tool.description.length > 10, `Tool ${tool.name} description too short: "${tool.description}"`);
      }
    } finally {
      proc.kill();
    }
  });

  it("returns error for tools/call when database is unreachable", async () => {
    const proc = startServer();
    try {
      await sendRequest(proc, "initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "0.1.0" },
      }, 1);

      proc.stdin?.write(JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }) + "\n");

      const response = await sendRequest(proc, "tools/call", {
        name: "browse_schema",
        arguments: {},
      }, 2);

      // Should get a result with isError or an error response
      // MCP SDK returns tool errors as result with isError: true
      assert.ok(response.result || response.error, "Expected either result or error");
      if (response.result) {
        const content = response.result.content as Array<{ type: string; text: string }>;
        // The tool should have handled the connection error gracefully
        assert.ok(content, "Expected content in result");
      }
    } finally {
      proc.kill();
    }
  });
});
