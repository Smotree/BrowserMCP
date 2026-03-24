#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebSocketBridge } from "./ws-bridge.js";
import { createMcpServer } from "./mcp-server.js";

const WS_PORT = parseInt(process.env.BROWSER_MCP_WS_PORT ?? "12800", 10);

async function main() {
  const bridge = new WebSocketBridge(WS_PORT);
  await bridge.start();
  const server = createMcpServer(bridge);

  // STDIO transport for Claude Code and similar MCP clients
  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write("[BrowserMCP] MCP server ready (STDIO transport)\n");

  // Graceful shutdown
  const shutdown = async () => {
    process.stderr.write("[BrowserMCP] Shutting down...\n");
    await server.close();
    await bridge.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  process.stderr.write(`[BrowserMCP] Fatal error: ${err.message}\n`);
  process.exit(1);
});
