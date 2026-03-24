import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WebSocketBridge } from "../ws-bridge.js";
import { textResult } from "./helpers.js";

export function registerInteractionTools(server: McpServer, bridge: WebSocketBridge) {
  server.tool(
    "browser_right_click",
    "Right-click (context menu) on an element by CSS selector.",
    {
      selector: z.string().describe("CSS selector of the element"),
      tabId: z.number().optional(),
    },
    async ({ selector, tabId }) => {
      await bridge.sendCommand("right_click", { selector, tabId });
      return textResult(`Right-clicked: ${selector}`);
    }
  );

  server.tool(
    "browser_double_click",
    "Double-click on an element by CSS selector.",
    {
      selector: z.string().describe("CSS selector of the element"),
      tabId: z.number().optional(),
    },
    async ({ selector, tabId }) => {
      await bridge.sendCommand("double_click", { selector, tabId });
      return textResult(`Double-clicked: ${selector}`);
    }
  );

  server.tool(
    "browser_drag_drop",
    "Drag an element and drop it onto another element.",
    {
      fromSelector: z.string().describe("CSS selector of the draggable element"),
      toSelector: z.string().describe("CSS selector of the drop target"),
      tabId: z.number().optional(),
    },
    async ({ fromSelector, toSelector, tabId }) => {
      await bridge.sendCommand("drag_drop", { fromSelector, toSelector, tabId });
      return textResult(`Dragged ${fromSelector} → ${toSelector}`);
    }
  );
}
