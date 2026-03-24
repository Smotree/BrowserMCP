#!/usr/bin/env node
// BrowserMCP — Auto-install MCP configuration
// Detects Claude Code, VS Code, Cursor and adds BrowserMCP to each.
// Usage: node scripts/install-mcp.mjs

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir, platform } from "node:os";

const home = homedir();
const isWin = platform() === "win32";
const serverPath = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..", "server", "dist", "index.js");

function log(icon, msg) { console.log(`  ${icon}  ${msg}`); }
function ok(msg) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`); }
function skip(msg) { console.log(`  \x1b[33m-\x1b[0m ${msg}`); }
function fail(msg) { console.log(`  \x1b[31m✗\x1b[0m ${msg}`); }

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return null; }
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

// ── Paths ──

const configs = [
  {
    name: "Claude Code (user-scoped ~/.claude.json)",
    path: resolve(home, ".claude.json"),
    format: "claude", // { mcpServers: { ... } }
  },
  {
    name: "VS Code (mcp.json)",
    path: isWin
      ? resolve(home, "AppData", "Roaming", "Code", "User", "mcp.json")
      : platform() === "darwin"
        ? resolve(home, "Library", "Application Support", "Code", "User", "mcp.json")
        : resolve(home, ".config", "Code", "User", "mcp.json"),
    format: "vscode", // { servers: { ... } }
  },
  {
    name: "Cursor (mcp.json)",
    path: isWin
      ? resolve(home, "AppData", "Roaming", "Cursor", "User", "mcp.json")
      : platform() === "darwin"
        ? resolve(home, "Library", "Application Support", "Cursor", "User", "mcp.json")
        : resolve(home, ".config", "Cursor", "User", "mcp.json"),
    format: "vscode",
  },
  {
    name: "Claude Desktop (claude_desktop_config.json)",
    path: isWin
      ? resolve(home, "AppData", "Roaming", "Claude", "claude_desktop_config.json")
      : platform() === "darwin"
        ? resolve(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
        : resolve(home, ".config", "Claude", "claude_desktop_config.json"),
    format: "claude-desktop", // { mcpServers: { ... } }
  },
];

// ── Install ──

console.log("\n\x1b[1mBrowserMCP — MCP Configuration Installer\x1b[0m\n");
log("📦", `Server path: ${serverPath}`);

if (!existsSync(serverPath)) {
  fail(`Server not built! Run: npm run build`);
  process.exit(1);
}

console.log();

let installed = 0;

for (const cfg of configs) {
  const dirExists = existsSync(dirname(cfg.path));

  if (!dirExists) {
    skip(`${cfg.name} — not installed`);
    continue;
  }

  const data = readJson(cfg.path) || {};
  const serverEntry = {
    command: "node",
    args: [serverPath],
  };

  if (cfg.format === "claude") {
    // { mcpServers: { browser: { command, args } } }
    if (!data.mcpServers) data.mcpServers = {};
    if (data.mcpServers.browser) {
      skip(`${cfg.name} — already configured`);
      continue;
    }
    data.mcpServers.browser = serverEntry;
  } else if (cfg.format === "vscode") {
    // { servers: { browser: { command, args, type: "stdio" } } }
    if (!data.servers) data.servers = {};
    if (data.servers.browser || data.servers["browser-mcp"]) {
      skip(`${cfg.name} — already configured`);
      continue;
    }
    data.servers.browser = { ...serverEntry, type: "stdio" };
    if (!data.inputs) data.inputs = [];
  } else if (cfg.format === "claude-desktop") {
    // { mcpServers: { browser: { command, args } } }
    if (!data.mcpServers) data.mcpServers = {};
    if (data.mcpServers.browser) {
      skip(`${cfg.name} — already configured`);
      continue;
    }
    data.mcpServers.browser = serverEntry;
  }

  writeJson(cfg.path, data);
  ok(`${cfg.name} — installed!`);
  installed++;
}

console.log();
if (installed > 0) {
  log("🎉", `Done! Added BrowserMCP to ${installed} config(s).`);
  log("💡", "Restart your IDE/client to pick up the changes.");
} else {
  log("ℹ️", "BrowserMCP already configured everywhere (or no clients found).");
}
console.log();
