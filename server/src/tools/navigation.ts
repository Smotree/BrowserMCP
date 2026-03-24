import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WebSocketBridge } from "../ws-bridge.js";
import { textResult, jsonResult } from "./helpers.js";

export function registerNavigationTools(server: McpServer, bridge: WebSocketBridge) {
  server.tool(
    "browser_scroll",
    "Scroll the page in a direction or to a specific element.",
    {
      direction: z.enum(["up", "down", "left", "right"]).optional().describe("Scroll direction"),
      pixels: z.number().optional().default(500).describe("Pixels to scroll"),
      selector: z.string().optional().describe("CSS selector to scroll into view (overrides direction/pixels)"),
      tabId: z.number().optional(),
    },
    async ({ direction, pixels, selector, tabId }) => {
      const result = await bridge.sendCommand("scroll", { direction, pixels, selector, tabId });
      return jsonResult(result);
    }
  );

  server.tool(
    "browser_back",
    "Navigate back in browser history.",
    { tabId: z.number().optional() },
    async ({ tabId }) => {
      const result = await bridge.sendCommand("back", { tabId });
      return jsonResult(result);
    }
  );

  server.tool(
    "browser_forward",
    "Navigate forward in browser history.",
    { tabId: z.number().optional() },
    async ({ tabId }) => {
      const result = await bridge.sendCommand("forward", { tabId });
      return jsonResult(result);
    }
  );

  server.tool(
    "browser_switch_tab",
    "Activate/focus a specific browser tab.",
    { tabId: z.number().describe("Tab ID to activate") },
    async ({ tabId }) => {
      const result = await bridge.sendCommand("switch_tab", { tabId });
      return jsonResult(result);
    }
  );

  server.tool(
    "browser_keyboard",
    "Press a key or key combination on the page.",
    {
      key: z.string().describe("Key to press: Enter, Escape, Tab, ArrowDown, a, etc."),
      modifiers: z.array(z.enum(["ctrl", "shift", "alt", "meta"])).optional().describe("Modifier keys"),
      selector: z.string().optional().describe("CSS selector to focus before pressing"),
      tabId: z.number().optional(),
    },
    async ({ key, modifiers, selector, tabId }) => {
      await bridge.sendCommand("keyboard", { key, modifiers, selector, tabId });
      return textResult(`Pressed key: ${modifiers?.length ? modifiers.join("+") + "+" : ""}${key}`);
    }
  );

  server.tool(
    "browser_hover",
    "Hover over an element identified by CSS selector.",
    {
      selector: z.string().describe("CSS selector of the element to hover"),
      tabId: z.number().optional(),
    },
    async ({ selector, tabId }) => {
      await bridge.sendCommand("hover", { selector, tabId });
      return textResult(`Hovered over: ${selector}`);
    }
  );

  server.tool(
    "browser_select",
    "Select an option in a <select> dropdown element.",
    {
      selector: z.string().describe("CSS selector of the <select> element"),
      value: z.string().describe("Value of the option to select"),
      tabId: z.number().optional(),
    },
    async ({ selector, value, tabId }) => {
      const result = await bridge.sendCommand("select", { selector, value, tabId });
      return jsonResult(result);
    }
  );
}
