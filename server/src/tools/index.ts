import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebSocketBridge } from "../ws-bridge.js";

import { registerCoreTools } from "./core.js";
import { registerNavigationTools } from "./navigation.js";
import { registerUtilityTools } from "./utilities.js";
import { registerExtractionTools } from "./extraction.js";
import { registerInteractionTools } from "./interaction.js";
import { registerMonitoringTools } from "./monitoring.js";
import { registerWindowTools } from "./window.js";
import { registerContentTools } from "./content.js";

export function registerAllTools(server: McpServer, bridge: WebSocketBridge) {
  registerCoreTools(server, bridge);
  registerNavigationTools(server, bridge);
  registerUtilityTools(server, bridge);
  registerExtractionTools(server, bridge);
  registerInteractionTools(server, bridge);
  registerMonitoringTools(server, bridge);
  registerWindowTools(server, bridge);
  registerContentTools(server, bridge);
}
