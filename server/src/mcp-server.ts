import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebSocketBridge } from "./ws-bridge.js";
import { registerAllTools } from "./tools/index.js";

export function createMcpServer(bridge: WebSocketBridge): McpServer {
  const server = new McpServer({
    name: "browser-mcp",
    version: "2.0.0",
  });

  registerAllTools(server, bridge);

  return server;
}
