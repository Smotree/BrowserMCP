# BrowserMCP

MCP server that gives AI assistants full control over your browser. Works with Claude Code, Cursor, and any MCP-compatible client.

The key advantage: uses your real browser session with all cookies, auth tokens, and extensions — no headless browser, no 403 errors.

## Architecture

```
AI Client (Claude Code)  --stdio-->  MCP Server (Node.js)  --WebSocket-->  Chrome Extension
                                     port 12800
```

Three components:
- **MCP Server** — Node.js process, communicates with AI via stdio, bridges to browser via WebSocket
- **WebSocket Bridge** — runs on port 12800, connects server to extension
- **Chrome Extension** — Manifest V3, executes commands in the browser using Chrome APIs

## 36 Tools

### Core
| Tool | Description |
|------|-------------|
| `browser_navigate` | Open URL and return page content |
| `browser_read_page` | Read content from active or specific tab (text/html/full) |
| `browser_list_tabs` | List all open tabs with IDs, URLs, titles |
| `browser_close_tab` | Close a tab by ID |
| `browser_click` | Click element by CSS selector |
| `browser_type` | Type text into input field |
| `browser_screenshot` | Capture visible tab as PNG |
| `browser_execute_js` | Run JavaScript on the page |

### Navigation
| Tool | Description |
|------|-------------|
| `browser_scroll` | Scroll by direction/pixels or to CSS selector |
| `browser_back` | Navigate back in history |
| `browser_forward` | Navigate forward in history |
| `browser_switch_tab` | Activate and focus a tab |
| `browser_keyboard` | Press keys with modifiers, inserts characters into inputs |
| `browser_hover` | Hover over element (mouseenter/mouseover) |
| `browser_select` | Select option in dropdown |

### Data Extraction
| Tool | Description |
|------|-------------|
| `browser_get_links` | Extract all links, optionally filtered |
| `browser_get_elements` | Query elements by CSS selector with attributes |
| `browser_extract_table` | Parse table into structured JSON (headers + rows) |
| `browser_extract_meta` | Extract meta tags, OpenGraph, Twitter Cards, JSON-LD |
| `browser_extract_images` | Get all images with src, alt, dimensions |
| `browser_get_cookies` | Read cookies for a URL |
| `browser_get_storage` | Read localStorage or sessionStorage |

### Utilities
| Tool | Description |
|------|-------------|
| `browser_wait_for` | Wait for element to appear (MutationObserver) |
| `browser_new_tab` | Open new tab |
| `browser_reload` | Reload tab (with optional cache bypass) |
| `browser_set_storage` | Write to localStorage or sessionStorage |
| `browser_set_cookies` | Set a cookie |
| `browser_find_text` | Search text on page with context |

### Monitoring
| Tool | Description |
|------|-------------|
| `browser_console_log` | Capture console.log/warn/error (start/get/stop) |
| `browser_network_log` | Capture fetch/XHR requests (start/get/stop) |
| `browser_get_computed_style` | Read computed CSS properties |
| `browser_inject_css` | Inject custom CSS into page |
| `browser_highlight` | Highlight elements with colored outline |
| `browser_readability` | Extract main article content (Reader Mode) |
| `browser_watch_changes` | Watch DOM mutations (start/get/stop) |

### Window Management
| Tool | Description |
|------|-------------|
| `browser_new_window` | Open new window (with size, incognito) |
| `browser_close_window` | Close window by ID |
| `browser_resize_window` | Resize window |
| `browser_move_tab` | Move tab between windows |
| `browser_pin_tab` | Pin/unpin tab |
| `browser_mute_tab` | Mute/unmute tab |

### Advanced Interaction
| Tool | Description |
|------|-------------|
| `browser_right_click` | Right-click (contextmenu event) |
| `browser_double_click` | Double-click |
| `browser_drag_drop` | Drag and drop between elements |

## Installation

### 1. Clone and build

```bash
git clone https://github.com/Smotree/BrowserMCP.git
cd BrowserMCP
npm install
npm run build
```

### 2. Load Chrome extension

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `extension/` folder

### 3. Configure your MCP client

#### Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "browser": {
      "command": "node",
      "args": ["/path/to/BrowserMCP/server/dist/index.js"]
    }
  }
}
```

Or add `.mcp.json` to your project root:

```json
{
  "mcpServers": {
    "browser": {
      "command": "node",
      "args": ["/path/to/BrowserMCP/server/dist/index.js"]
    }
  }
}
```

#### Cursor / Other MCP Clients

Same configuration format — point to `server/dist/index.js` as a stdio command.

### 4. Verify

The extension badge shows **ON** (green) when connected, **OFF** (red) when disconnected. The extension auto-reconnects within 1-2 seconds when the server starts.

## Testing

A test page and two test scripts are included:

```bash
# Serve the test page
npm run test:serve

# Quick test — verifies all tools with DOM state checks
# (close Claude Code first to free port 12800)
npm run test:quick

# Demo test — visual walkthrough of all tools for screen recording
npm run test:demo
```

Both test scripts auto-kill any process on port 12800 before starting.

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `BROWSER_MCP_WS_PORT` | `12800` | WebSocket port for server-extension communication |

## Project Structure

```
BrowserMCP/
  extension/              Chrome extension (Manifest V3)
    background.js           Service worker — WebSocket client, command handlers
    manifest.json           Extension manifest
    popup.html/js           Connection status popup
    icons/                  Extension icons
  server/                 MCP server (TypeScript)
    src/
      index.ts              Entry point — stdio transport + WS bridge
      mcp-server.ts         Creates MCP server, registers tools
      ws-bridge.ts          WebSocket server with request correlation
      types.ts              Shared types
      tools/                Tool definitions by category
        core.ts             navigate, read_page, list_tabs, etc.
        navigation.ts       scroll, back, forward, keyboard, etc.
        extraction.ts       get_links, extract_table, get_cookies, etc.
        utilities.ts        wait_for, new_tab, reload, find_text, etc.
        interaction.ts      right_click, double_click, drag_drop
        monitoring.ts       console_log, network_log, inject_css, etc.
        window.ts           new_window, resize_window, pin_tab, etc.
        content.ts          highlight, readability, watch_changes, etc.
  test/
    test-page.html          Test page exercising all 36 tools
    quick-test.mjs          Automated test with assertions
    demo-test.mjs           Visual demo for screen recording
```

## How It Works

1. MCP client (Claude Code) spawns `node server/dist/index.js` as a child process
2. Server communicates with the client via stdin/stdout (MCP protocol)
3. Server starts a WebSocket server on port 12800
4. Chrome extension connects to the WebSocket and waits for commands
5. When a tool is called, server sends a command to the extension via WebSocket
6. Extension executes the command using Chrome APIs and returns the result
7. Server forwards the result back to the MCP client

## License

MIT
