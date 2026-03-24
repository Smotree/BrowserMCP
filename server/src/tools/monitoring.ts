import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WebSocketBridge } from "../ws-bridge.js";
import { textResult, jsonResult } from "./helpers.js";

export function registerMonitoringTools(server: McpServer, bridge: WebSocketBridge) {
  server.tool(
    "browser_get_computed_style",
    "Get computed CSS styles for an element.",
    {
      selector: z.string().describe("CSS selector of the element"),
      properties: z.array(z.string()).optional().describe("CSS properties to get. If omitted, returns common properties."),
      tabId: z.number().optional(),
    },
    async ({ selector, properties, tabId }) => {
      const result = await bridge.sendCommand("get_computed_style", { selector, properties, tabId });
      return jsonResult(result);
    }
  );

  server.tool(
    "browser_inject_css",
    "Inject custom CSS styles into the page.",
    {
      css: z.string().describe("CSS code to inject"),
      tabId: z.number().optional(),
    },
    async ({ css, tabId }) => {
      await bridge.sendCommand("inject_css", { css, tabId });
      return textResult("CSS injected.");
    }
  );

  server.tool(
    "browser_network_log",
    "Capture network requests (fetch/XHR) on the page. Use 'start' to begin, 'get' to retrieve, 'stop' to end.",
    {
      action: z.enum(["start", "stop", "get"]).describe("Action to perform"),
      filter: z.string().optional().describe("URL substring filter"),
      tabId: z.number().optional(),
    },
    async ({ action, filter, tabId }) => {
      const result = await bridge.sendCommand("network_log", { action, filter, tabId });
      return jsonResult(result);
    }
  );

  server.tool(
    "browser_console_log",
    "Capture console output (log/warn/error) on the page. Use 'start' to begin, 'get' to retrieve, 'stop' to end.",
    {
      action: z.enum(["start", "stop", "get"]).describe("Action to perform"),
      tabId: z.number().optional(),
    },
    async ({ action, tabId }) => {
      const result = await bridge.sendCommand("console_log", { action, tabId });
      return jsonResult(result);
    }
  );
}
