import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WebSocketBridge } from "../ws-bridge.js";
import type { PageContent, TabInfo } from "../types.js";
import { truncate, textResult } from "./helpers.js";

export function registerCoreTools(server: McpServer, bridge: WebSocketBridge) {
  server.tool(
    "browser_navigate",
    "Navigate to a URL in the browser and return page content. Uses the user's logged-in browser session, bypassing 403/auth issues.",
    {
      url: z.string().url().describe("The URL to navigate to"),
      waitMs: z.number().optional().default(1000).describe("Extra ms to wait after page load for SPA rendering"),
    },
    async ({ url, waitMs }) => {
      const result = (await bridge.sendCommand("navigate", { url, waitMs })) as PageContent;
      return textResult(`Title: ${result.title}\nURL: ${result.url}\n\n${truncate(result.text)}`);
    }
  );

  server.tool(
    "browser_read_page",
    "Read content from the current active tab or a specific tab.",
    {
      tabId: z.number().optional().describe("Tab ID to read from. If omitted, reads active tab."),
      format: z.enum(["text", "html", "full"]).optional().default("text").describe("Content format"),
    },
    async ({ tabId, format }) => {
      const result = (await bridge.sendCommand("read_page", { tabId, format })) as PageContent;
      if (format === "html") {
        return textResult(truncate(result.html ?? "", 200_000));
      }
      if (format === "full") {
        const meta = result.meta
          ? Object.entries(result.meta).map(([k, v]) => `${k}: ${v}`).join("\n")
          : "";
        return textResult(`Title: ${result.title}\nURL: ${result.url}\n\nMeta:\n${meta}\n\nText:\n${truncate(result.text)}\n\nHTML:\n${truncate(result.html ?? "", 200_000)}`);
      }
      return textResult(`Title: ${result.title}\nURL: ${result.url}\n\n${truncate(result.text)}`);
    }
  );

  server.tool(
    "browser_list_tabs",
    "List all open browser tabs with their IDs, URLs, and titles.",
    {},
    async () => {
      const tabs = (await bridge.sendCommand("list_tabs")) as TabInfo[];
      const lines = tabs.map(
        (t) => `[${t.id}] ${t.active ? "(active) " : ""}${t.title}\n    ${t.url}`
      );
      return textResult(lines.join("\n\n") || "No tabs open.");
    }
  );

  server.tool(
    "browser_close_tab",
    "Close a specific browser tab by its ID.",
    { tabId: z.number().describe("The ID of the tab to close") },
    async ({ tabId }) => {
      await bridge.sendCommand("close_tab", { tabId });
      return textResult(`Tab ${tabId} closed.`);
    }
  );

  server.tool(
    "browser_click",
    "Click on an element in the page identified by CSS selector.",
    {
      selector: z.string().describe("CSS selector of the element to click"),
      tabId: z.number().optional().describe("Tab ID. If omitted, uses active tab."),
    },
    async ({ selector, tabId }) => {
      await bridge.sendCommand("click", { selector, tabId });
      return textResult(`Clicked element: ${selector}`);
    }
  );

  server.tool(
    "browser_type",
    "Type text into an input field identified by CSS selector.",
    {
      selector: z.string().describe("CSS selector of the input element"),
      text: z.string().describe("Text to type into the field"),
      tabId: z.number().optional().describe("Tab ID. If omitted, uses active tab."),
    },
    async ({ selector, text, tabId }) => {
      await bridge.sendCommand("type", { selector, text, tabId });
      return textResult(`Typed "${text}" into ${selector}`);
    }
  );

  server.tool(
    "browser_screenshot",
    "Take a screenshot of the current browser tab. Returns a base64-encoded PNG image.",
    { tabId: z.number().optional().describe("Tab ID. If omitted, screenshots active tab.") },
    async ({ tabId }) => {
      const result = (await bridge.sendCommand("screenshot", { tabId })) as string;
      const base64 = result.replace(/^data:image\/png;base64,/, "");
      return {
        content: [{ type: "image" as const, data: base64, mimeType: "image/png" }],
      };
    }
  );

  server.tool(
    "browser_execute_js",
    "Execute JavaScript code in the context of the current page and return the result.",
    {
      code: z.string().describe("JavaScript code to execute in the page context"),
      tabId: z.number().optional().describe("Tab ID. If omitted, uses active tab."),
    },
    async ({ code, tabId }) => {
      const result = await bridge.sendCommand("execute_js", { code, tabId });
      const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
      return textResult(truncate(text));
    }
  );
}
