import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WebSocketBridge } from "../ws-bridge.js";
import { textResult, jsonResult } from "./helpers.js";

export function registerUtilityTools(server: McpServer, bridge: WebSocketBridge) {
  server.tool(
    "browser_wait_for",
    "Wait for an element matching a CSS selector to appear on the page.",
    {
      selector: z.string().describe("CSS selector to wait for"),
      timeout: z.number().optional().default(10000).describe("Timeout in ms"),
      tabId: z.number().optional(),
    },
    async ({ selector, timeout, tabId }) => {
      const result = await bridge.sendCommand("wait_for", { selector, timeout, tabId });
      return jsonResult(result);
    }
  );

  server.tool(
    "browser_new_tab",
    "Open a new browser tab.",
    {
      url: z.string().optional().describe("URL to open. If omitted, opens blank tab."),
    },
    async ({ url }) => {
      const result = await bridge.sendCommand("new_tab", { url });
      return jsonResult(result);
    }
  );

  server.tool(
    "browser_reload",
    "Reload a browser tab.",
    {
      tabId: z.number().optional(),
      hard: z.boolean().optional().default(false).describe("If true, bypasses cache"),
    },
    async ({ tabId, hard }) => {
      await bridge.sendCommand("reload", { tabId, hard });
      return textResult("Tab reloaded.");
    }
  );

  server.tool(
    "browser_set_storage",
    "Write a value to localStorage or sessionStorage.",
    {
      type: z.enum(["localStorage", "sessionStorage"]),
      key: z.string(),
      value: z.string(),
      tabId: z.number().optional(),
    },
    async ({ type, key, value, tabId }) => {
      await bridge.sendCommand("set_storage", { type, key, value, tabId });
      return textResult(`Set ${type}.${key} = "${value}"`);
    }
  );

  server.tool(
    "browser_find_text",
    "Search for text on the page and return matches with surrounding context.",
    {
      text: z.string().describe("Text to search for"),
      tabId: z.number().optional(),
    },
    async ({ text, tabId }) => {
      const result = await bridge.sendCommand("find_text", { text, tabId });
      return jsonResult(result);
    }
  );
}
