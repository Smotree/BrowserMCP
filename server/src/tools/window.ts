import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WebSocketBridge } from "../ws-bridge.js";
import { jsonResult, textResult } from "./helpers.js";

export function registerWindowTools(server: McpServer, bridge: WebSocketBridge) {
  server.tool(
    "browser_new_window",
    "Open a new browser window.",
    {
      url: z.string().optional().describe("URL to open"),
      incognito: z.boolean().optional().default(false).describe("Open in incognito mode"),
      width: z.number().optional().describe("Window width"),
      height: z.number().optional().describe("Window height"),
    },
    async ({ url, incognito, width, height }) => {
      const result = await bridge.sendCommand("new_window", { url, incognito, width, height });
      return jsonResult(result);
    }
  );

  server.tool(
    "browser_close_window",
    "Close a browser window by its ID.",
    {
      windowId: z.number().describe("Window ID to close"),
    },
    async ({ windowId }) => {
      await bridge.sendCommand("close_window", { windowId });
      return textResult(`Window ${windowId} closed.`);
    }
  );

  server.tool(
    "browser_resize_window",
    "Resize a browser window.",
    {
      width: z.number().describe("Window width in pixels"),
      height: z.number().describe("Window height in pixels"),
      windowId: z.number().optional().describe("Window ID. If omitted, uses focused window."),
    },
    async ({ width, height, windowId }) => {
      const result = await bridge.sendCommand("resize_window", { width, height, windowId });
      return jsonResult(result);
    }
  );

  server.tool(
    "browser_move_tab",
    "Move a tab to a different window.",
    {
      tabId: z.number().describe("Tab ID to move"),
      windowId: z.number().describe("Target window ID"),
      index: z.number().optional().default(-1).describe("Position in the window. -1 = end."),
    },
    async ({ tabId, windowId, index }) => {
      const result = await bridge.sendCommand("move_tab", { tabId, windowId, index });
      return jsonResult(result);
    }
  );

  server.tool(
    "browser_pin_tab",
    "Pin or unpin a browser tab.",
    {
      tabId: z.number().describe("Tab ID"),
      pinned: z.boolean().optional().default(true),
    },
    async ({ tabId, pinned }) => {
      await bridge.sendCommand("pin_tab", { tabId, pinned });
      return textResult(`Tab ${tabId} ${pinned ? "pinned" : "unpinned"}.`);
    }
  );

  server.tool(
    "browser_mute_tab",
    "Mute or unmute a browser tab.",
    {
      tabId: z.number().describe("Tab ID"),
      muted: z.boolean().optional().default(true),
    },
    async ({ tabId, muted }) => {
      await bridge.sendCommand("mute_tab", { tabId, muted });
      return textResult(`Tab ${tabId} ${muted ? "muted" : "unmuted"}.`);
    }
  );
}
