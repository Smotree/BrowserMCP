import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WebSocketBridge } from "../ws-bridge.js";
import { textResult, jsonResult } from "./helpers.js";

export function registerContentTools(server: McpServer, bridge: WebSocketBridge) {
  server.tool(
    "browser_highlight",
    "Highlight elements on the page with a colored outline.",
    {
      selector: z.string().describe("CSS selector of elements to highlight"),
      color: z.string().optional().default("red").describe("Outline color"),
      tabId: z.number().optional(),
    },
    async ({ selector, color, tabId }) => {
      const result = await bridge.sendCommand("highlight", { selector, color, tabId });
      return jsonResult(result);
    }
  );

  server.tool(
    "browser_extract_images",
    "Extract all images from the page with their attributes.",
    { tabId: z.number().optional() },
    async ({ tabId }) => {
      const result = await bridge.sendCommand("extract_images", { tabId });
      return jsonResult(result);
    }
  );

  server.tool(
    "browser_extract_meta",
    "Extract all meta tags, Open Graph, Twitter Cards, JSON-LD, and canonical URL from the page.",
    { tabId: z.number().optional() },
    async ({ tabId }) => {
      const result = await bridge.sendCommand("extract_meta", { tabId });
      return jsonResult(result);
    }
  );

  server.tool(
    "browser_readability",
    "Extract the main article content from the page (Reader Mode).",
    { tabId: z.number().optional() },
    async ({ tabId }) => {
      const result = await bridge.sendCommand("readability", { tabId });
      return jsonResult(result);
    }
  );

  server.tool(
    "browser_watch_changes",
    "Watch for DOM changes on the page using MutationObserver. Use 'start' to begin, 'get' to retrieve, 'stop' to end.",
    {
      action: z.enum(["start", "stop", "get"]).describe("Action to perform"),
      selector: z.string().optional().default("body").describe("CSS selector to observe"),
      tabId: z.number().optional(),
    },
    async ({ action, selector, tabId }) => {
      const result = await bridge.sendCommand("watch_changes", { action, selector, tabId });
      return jsonResult(result);
    }
  );

  server.tool(
    "browser_set_cookies",
    "Set a cookie for a specific URL.",
    {
      url: z.string().url().describe("URL to set cookie for"),
      name: z.string().describe("Cookie name"),
      value: z.string().describe("Cookie value"),
      domain: z.string().optional(),
      path: z.string().optional().default("/"),
      secure: z.boolean().optional(),
      httpOnly: z.boolean().optional(),
      expirationDate: z.number().optional().describe("Expiration as Unix timestamp"),
    },
    async ({ url, name, value, domain, path, secure, httpOnly, expirationDate }) => {
      const result = await bridge.sendCommand("set_cookies", { url, name, value, domain, path, secure, httpOnly, expirationDate });
      return jsonResult(result);
    }
  );
}
