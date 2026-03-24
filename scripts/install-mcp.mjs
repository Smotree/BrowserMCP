#!/usr/bin/env node
// BrowserMCP — Auto-install MCP configuration
// Detects Claude Code, VS Code, Cursor, Claude Desktop and adds BrowserMCP.
// Usage: node scripts/install-mcp.mjs [--uninstall]

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir, platform } from "node:os";

const home = homedir();
const isWin = platform() === "win32";
const uninstall = process.argv.includes("--uninstall");

// Resolve server path (handles Windows drive letter in file:// URLs)
const scriptDir = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const serverPath = resolve(scriptDir, "..", "server", "dist", "index.js");

// Use full path to node.exe on Windows to avoid PATH issues
const nodePath = process.execPath;

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

// ── Target configs ──

const configs = [
  {
    name: "Claude Code (user-scoped ~/.claude.json)",
    path: resolve(home, ".claude.json"),
    format: "claude",
  },
  {
    name: "VS Code (mcp.json)",
    path: isWin
      ? resolve(home, "AppData", "Roaming", "Code", "User", "mcp.json")
      : platform() === "darwin"
        ? resolve(home, "Library", "Application Support", "Code", "User", "mcp.json")
        : resolve(home, ".config", "Code", "User", "mcp.json"),
    format: "vscode",
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
    name: "Claude Desktop",
    path: isWin
      ? resolve(home, "AppData", "Roaming", "Claude", "claude_desktop_config.json")
      : platform() === "darwin"
        ? resolve(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
        : resolve(home, ".config", "Claude", "claude_desktop_config.json"),
    format: "claude-desktop",
  },
];

// ── Helpers ──

function getServersMap(data, format) {
  if (format === "vscode") {
    if (!data.servers) data.servers = {};
    return data.servers;
  }
  // claude, claude-desktop
  if (!data.mcpServers) data.mcpServers = {};
  return data.mcpServers;
}

function makeEntry(format) {
  const entry = {
    type: "stdio",
    command: nodePath,
    args: [serverPath],
  };
  if (format === "vscode") {
    return entry;
  }
  return entry;
}

// ── Main ──

const action = uninstall ? "Uninstaller" : "Installer";
console.log(`\n\x1b[1mBrowserMCP — MCP Configuration ${action}\x1b[0m\n`);
log("📦", `Server: ${serverPath}`);
log("🔧", `Node:   ${nodePath}`);

if (!uninstall && !existsSync(serverPath)) {
  fail("Server not built! Run: npm run build");
  process.exit(1);
}

console.log();

let changed = 0;

for (const cfg of configs) {
  const dirExists = existsSync(dirname(cfg.path));

  if (!dirExists) {
    skip(`${cfg.name} — not installed`);
    continue;
  }

  const data = readJson(cfg.path) || {};
  const servers = getServersMap(data, cfg.format);

  if (uninstall) {
    if (!servers.browser) {
      skip(`${cfg.name} — not configured`);
      continue;
    }
    delete servers.browser;
    writeJson(cfg.path, data);
    ok(`${cfg.name} — removed!`);
    changed++;
  } else {
    if (servers.browser) {
      skip(`${cfg.name} — already configured`);
      continue;
    }
    servers.browser = makeEntry(cfg.format);
    if (cfg.format === "vscode" && !data.inputs) data.inputs = [];
    writeJson(cfg.path, data);
    ok(`${cfg.name} — installed!`);
    changed++;
  }
}

console.log();
if (changed > 0) {
  const verb = uninstall ? "Removed from" : "Added to";
  log("🎉", `${verb} ${changed} config(s).`);
  log("💡", "Restart your IDE/client to pick up the changes.");
} else {
  const msg = uninstall
    ? "BrowserMCP not found in any config."
    : "BrowserMCP already configured everywhere (or no clients found).";
  log("ℹ️", msg);
}
console.log();
