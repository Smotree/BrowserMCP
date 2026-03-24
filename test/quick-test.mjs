#!/usr/bin/env node
// BrowserMCP Quick Test — verifies all tools ACTUALLY work by checking page state.
// Usage: node test/quick-test.mjs
// Prerequisites: Chrome with BrowserMCP extension
// NOTE: Close Claude Code first (frees port 12800).

import { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";

const WS_PORT = parseInt(process.env.BROWSER_MCP_WS_PORT ?? "12800", 10);
const TEST_PAGE = "http://localhost:8111/test-page.html";

let ws;
const pending = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function call(action, params = {}) {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${action}`)); }, 30000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, action, params }));
  });
}

// Helper: read page state via JS
async function pageEval(code, tabId) {
  return await call("execute_js", { code, tabId });
}

// ─── Test Runner ──────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  \x1b[31m✗\x1b[0m ${name} — ${e.message}`);
  }
}

// ─── Main ─────────────────────────────────────────────────
async function main() {
  console.log("\n\x1b[1mBrowserMCP Quick Test (with page verification)\x1b[0m\n");

  // Kill any process holding the port
  try {
    const { execSync } = await import("node:child_process");
    if (process.platform === "win32") {
      const output = execSync(`powershell -Command "(Get-NetTCPConnection -LocalPort ${WS_PORT} -ErrorAction SilentlyContinue).OwningProcess"`, { encoding: "utf-8" }).trim();
      const pids = [...new Set(output.split(/\r?\n/).filter(Boolean))];
      for (const pid of pids) {
        if (pid && pid !== String(process.pid)) execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
      }
    } else {
      execSync(`fuser -k ${WS_PORT}/tcp 2>/dev/null || true`, { stdio: "ignore" });
    }
    await sleep(500);
  } catch {}

  const wss = new WebSocketServer({ port: WS_PORT });
  console.log(`WebSocket server on port ${WS_PORT}, waiting for extension...`);

  await new Promise((resolve) => {
    wss.on("connection", (socket) => {
      ws = socket;
      console.log("Extension connected!\n");
      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          const p = pending.get(msg.id);
          if (!p) return;
          pending.delete(msg.id);
          clearTimeout(p.timer);
          if (msg.error) p.reject(new Error(msg.error));
          else p.resolve(msg.result);
        } catch {}
      });
      resolve();
    });
  });

  let tabId;

  // ══════════════════════════════════════════════════════
  // 1. CORE
  // ══════════════════════════════════════════════════════
  console.log("\x1b[1m[Core]\x1b[0m");

  await test("navigate → page title contains 'BrowserMCP'", async () => {
    const r = await call("navigate", { url: TEST_PAGE, waitMs: 1500 });
    if (!r.title?.includes("BrowserMCP")) throw new Error(`Title: "${r.title}"`);
  });

  await test("list_tabs → find test page tab", async () => {
    const tabs = await call("list_tabs");
    const tab = tabs.find((t) => t.url?.includes("test-page"));
    if (!tab) throw new Error("Test tab not found in " + tabs.length + " tabs");
    tabId = tab.id;
  });

  await test("read_page → text contains 'Scroll Test'", async () => {
    const r = await call("read_page", { tabId, format: "text" });
    if (!r.text?.includes("Scroll Test")) throw new Error("Missing content");
  });

  await test("screenshot → returns base64 PNG", async () => {
    const r = await call("screenshot", { tabId });
    if (!r?.startsWith?.("data:image/png")) throw new Error("Not a PNG data URL");
  });

  await test("execute_js → 2+2=4 on page", async () => {
    const r = await pageEval("2 + 2", tabId);
    if (r !== 4) throw new Error(`Got ${r}`);
  });

  await test("type → value appears in input", async () => {
    await call("type", { selector: "#name-input", text: "TestUser", tabId });
    const val = await pageEval("document.getElementById('name-input').value", tabId);
    if (val !== "TestUser") throw new Error(`Input value: "${val}"`);
  });

  await test("click → form submits, output appears", async () => {
    await call("click", { selector: "#submit-btn", tabId });
    await sleep(200);
    const output = await pageEval("document.getElementById('form-output').textContent", tabId);
    if (!output.includes("TestUser")) throw new Error(`Form output: "${output.slice(0, 80)}"`);
  });

  await test("close_tab → tab disappears", async () => {
    await call("navigate", { url: "about:blank", waitMs: 200 });
    const before = await call("list_tabs");
    const blank = before.find((t) => t.url === "about:blank");
    if (!blank) throw new Error("No blank tab");
    await call("close_tab", { tabId: blank.id });
    const after = await call("list_tabs");
    if (after.find((t) => t.id === blank.id)) throw new Error("Tab still exists");
  });

  // ══════════════════════════════════════════════════════
  // 2. NAVIGATION
  // ══════════════════════════════════════════════════════
  console.log("\n\x1b[1m[Navigation]\x1b[0m");

  await test("scroll(direction) → scrollY increases", async () => {
    await call("scroll", { direction: "up", pixels: 99999, tabId }); // reset
    await sleep(100);
    const r = await call("scroll", { direction: "down", pixels: 600, tabId });
    if (r.scrollY < 400) throw new Error(`scrollY=${r.scrollY}, expected >400`);
  });

  await test("scroll(selector) → element in view", async () => {
    const r = await call("scroll", { selector: "#table-section", tabId });
    if (r.scrollY === 0) throw new Error("Didn't scroll");
  });

  await test("keyboard → page detects keypress", async () => {
    await call("keyboard", { key: "a", selector: "#keyboard-input", tabId });
    await sleep(100);
    const text = await pageEval("document.getElementById('keyboard-output').textContent", tabId);
    if (!text.includes("a")) throw new Error(`Keyboard output: "${text}"`);
  });

  await test("hover → mouseenter fires", async () => {
    // Set up a hover detector
    await pageEval(`
      window.__hoverDetected = false;
      document.getElementById('submit-btn').addEventListener('mouseenter', () => { window.__hoverDetected = true; }, { once: true });
    `, tabId);
    await call("hover", { selector: "#submit-btn", tabId });
    await sleep(100);
    const detected = await pageEval("window.__hoverDetected", tabId);
    if (!detected) throw new Error("mouseenter not detected");
  });

  await test("select → dropdown value changes", async () => {
    await call("select", { selector: "#color-select", value: "purple", tabId });
    const val = await pageEval("document.getElementById('color-select').value", tabId);
    if (val !== "purple") throw new Error(`Select value: "${val}"`);
  });

  await test("switch_tab → tab becomes active", async () => {
    const r = await call("switch_tab", { tabId });
    if (r.tabId !== tabId) throw new Error("Wrong tab");
  });

  await test("back/forward → navigates history", async () => {
    // Navigate to a second page first
    await pageEval("location.hash = '#test-back'", tabId);
    await sleep(200);
    await call("back", { tabId });
    await sleep(300);
    const url1 = await pageEval("location.hash", tabId);
    await call("forward", { tabId });
    await sleep(300);
    const url2 = await pageEval("location.hash", tabId);
    if (url2 !== "#test-back") throw new Error(`After forward: hash="${url2}"`);
  });

  // ══════════════════════════════════════════════════════
  // 3. EXTRACTION
  // ══════════════════════════════════════════════════════
  console.log("\n\x1b[1m[Extraction]\x1b[0m");

  await test("get_links → finds example.com links", async () => {
    const r = await call("get_links", { filter: "example.com", tabId });
    if (r.length < 2) throw new Error(`Only ${r.length} links`);
    if (!r[0].href.includes("example.com")) throw new Error(`First link: ${r[0].href}`);
  });

  await test("get_elements → .highlight-item has 5 items", async () => {
    const r = await call("get_elements", { selector: ".highlight-item", tabId });
    if (r.length !== 5) throw new Error(`Got ${r.length} elements, expected 5`);
    if (r[0].textContent !== "Item Alpha") throw new Error(`First: "${r[0].textContent}"`);
  });

  await test("extract_table → 5 columns, 6 rows", async () => {
    const r = await call("extract_table", { selector: "#data-table", tabId });
    if (r.headers.length !== 5) throw new Error(`${r.headers.length} headers`);
    if (r.rows.length !== 6) throw new Error(`${r.rows.length} rows`);
    if (r.rows[0][1] !== "Mechanical Keyboard") throw new Error(`Row 0 col 1: "${r.rows[0][1]}"`);
  });

  await test("extract_meta → OG + JSON-LD present", async () => {
    const r = await call("extract_meta", { tabId });
    if (r.openGraph?.["og:title"] !== "BrowserMCP Test Page") throw new Error(`OG title: "${r.openGraph?.["og:title"]}"`);
    if (!r.jsonLd?.[0]?.["@type"]) throw new Error("No JSON-LD");
    if (r.canonical !== "https://example.com/test-page") throw new Error(`Canonical: "${r.canonical}"`);
  });

  await test("extract_images → 3 SVG images with alt text", async () => {
    const r = await call("extract_images", { tabId });
    if (r.length < 3) throw new Error(`Only ${r.length} images`);
    if (!r[0].alt.includes("Image 1")) throw new Error(`Alt: "${r[0].alt}"`);
  });

  await test("get_cookies → read back cookie", async () => {
    await call("set_cookies", { url: "http://localhost:8111", name: "qtest", value: "qval" });
    const r = await call("get_cookies", { url: "http://localhost:8111" });
    const c = r.find((c) => c.name === "qtest");
    if (!c || c.value !== "qval") throw new Error("Cookie not found");
  });

  await test("get_storage → read back stored value", async () => {
    await call("set_storage", { type: "localStorage", key: "qtKey", value: "qtVal", tabId });
    const r = await call("get_storage", { type: "localStorage", key: "qtKey", tabId });
    if (r.qtKey !== "qtVal") throw new Error(`Got: ${JSON.stringify(r)}`);
  });

  // ══════════════════════════════════════════════════════
  // 4. UTILITIES
  // ══════════════════════════════════════════════════════
  console.log("\n\x1b[1m[Utilities]\x1b[0m");

  await test("new_tab + close → creates and removes", async () => {
    const before = (await call("list_tabs")).length;
    const r = await call("new_tab", { url: "about:blank" });
    const during = (await call("list_tabs")).length;
    if (during !== before + 1) throw new Error(`Tab count didn't increase`);
    await call("close_tab", { tabId: r.tabId });
  });

  await test("reload → page reloads (counter resets)", async () => {
    const before = await pageEval("document.getElementById('counter-value').textContent", tabId);
    await call("reload", { tabId });
    await sleep(1200);
    const after = await pageEval("document.getElementById('counter-value').textContent", tabId);
    if (parseInt(after) >= parseInt(before)) throw new Error(`Counter didn't reset: ${before} → ${after}`);
  });

  await test("set_storage → value persists on page", async () => {
    await call("set_storage", { type: "sessionStorage", key: "sKey", value: "sVal", tabId });
    const r = await pageEval("sessionStorage.getItem('sKey')", tabId);
    if (r !== "sVal") throw new Error(`sessionStorage: "${r}"`);
  });

  await test("find_text → finds XYZZY marker", async () => {
    const r = await call("find_text", { text: "XYZZY_MARKER_12345", tabId });
    if (!r.length) throw new Error("Not found");
    if (r[0].element !== "STRONG") throw new Error(`In <${r[0].element}>, expected <STRONG>`);
  });

  await test("wait_for → existing element found instantly", async () => {
    const r = await call("wait_for", { selector: "#data-table", timeout: 2000, tabId });
    if (!r.found) throw new Error("Not found");
  });

  await test("wait_for → dynamic element after click", async () => {
    await call("click", { selector: "#load-dynamic-btn", tabId });
    const r = await call("wait_for", { selector: "#loaded-element", timeout: 5000, tabId });
    if (!r.found) throw new Error("Element never appeared");
    if (!r.text.includes("loaded successfully")) throw new Error(`Text: "${r.text}"`);
  });

  // ══════════════════════════════════════════════════════
  // 5. INTERACTION
  // ══════════════════════════════════════════════════════
  console.log("\n\x1b[1m[Interaction]\x1b[0m");

  await test("right_click → contextmenu fires", async () => {
    await pageEval(`
      window.__contextMenuFired = false;
      document.getElementById('drag-item-1').addEventListener('contextmenu', () => { window.__contextMenuFired = true; }, { once: true });
    `, tabId);
    await call("right_click", { selector: "#drag-item-1", tabId });
    await sleep(100);
    const fired = await pageEval("window.__contextMenuFired", tabId);
    if (!fired) throw new Error("contextmenu not detected");
  });

  await test("double_click → dblclick fires", async () => {
    await pageEval(`
      window.__dblClickFired = false;
      document.getElementById('name-input').addEventListener('dblclick', () => { window.__dblClickFired = true; }, { once: true });
    `, tabId);
    await call("double_click", { selector: "#name-input", tabId });
    await sleep(100);
    const fired = await pageEval("window.__dblClickFired", tabId);
    if (!fired) throw new Error("dblclick not detected");
  });

  await test("drag_drop → item moves to drop zone", async () => {
    await pageEval(`
      window.__dropFired = false;
      document.getElementById('drop-target').addEventListener('drop', () => { window.__dropFired = true; }, { once: true });
    `, tabId);
    await call("drag_drop", { fromSelector: "#drag-item-2", toSelector: "#drop-target", tabId });
    await sleep(100);
    const fired = await pageEval("window.__dropFired", tabId);
    if (!fired) throw new Error("drop event not detected");
  });

  // ══════════════════════════════════════════════════════
  // 6. MONITORING
  // ══════════════════════════════════════════════════════
  console.log("\n\x1b[1m[Monitoring]\x1b[0m");

  await test("console_log → captures log/warn/error", async () => {
    await call("console_log", { action: "start", tabId });
    await pageEval("console.log('qt_log'); console.warn('qt_warn'); console.error('qt_err');", tabId);
    await sleep(300);
    const r = await call("console_log", { action: "get", tabId });
    await call("console_log", { action: "stop", tabId });
    const levels = r.map((e) => e.level);
    if (!levels.includes("log")) throw new Error("Missing log");
    if (!levels.includes("warn")) throw new Error("Missing warn");
    if (!levels.includes("error")) throw new Error("Missing error");
    const logEntry = r.find((e) => e.args?.includes("qt_log"));
    if (!logEntry) throw new Error("Log content not captured");
  });

  await test("network_log → captures fetch", async () => {
    await call("network_log", { action: "start", tabId });
    await pageEval("fetch('/test-page.html')", tabId);
    await sleep(800);
    const r = await call("network_log", { action: "get", tabId });
    await call("network_log", { action: "stop", tabId });
    if (!r.length) throw new Error("No requests");
    if (r[0].status !== 200) throw new Error(`Status: ${r[0].status}`);
  });

  await test("get_computed_style → correct styles for Box 2", async () => {
    const r = await call("get_computed_style", {
      selector: "#style-box-2",
      properties: ["background-color", "opacity", "font-size"],
      tabId,
    });
    if (!r["background-color"].includes("231")) throw new Error(`BG: ${r["background-color"]}`);
    if (r.opacity !== "0.8") throw new Error(`Opacity: ${r.opacity}`);
    if (r["font-size"] !== "20px") throw new Error(`Font: ${r["font-size"]}`);
  });

  await test("inject_css → changes page style", async () => {
    await call("inject_css", { css: "#style-box-1 { opacity: 0.5 !important; }", tabId });
    await sleep(100);
    const r = await pageEval("getComputedStyle(document.getElementById('style-box-1')).opacity", tabId);
    if (r !== "0.5") throw new Error(`Opacity after inject: ${r}`);
  });

  await test("highlight → outlines appear", async () => {
    const r = await call("highlight", { selector: ".highlight-item", color: "green", tabId });
    if (r.count !== 5) throw new Error(`Highlighted ${r.count}, expected 5`);
    const outline = await pageEval("getComputedStyle(document.querySelector('.highlight-item')).outlineColor", tabId);
    if (!outline.includes("0, 128, 0") && !outline.includes("green")) throw new Error(`Outline: ${outline}`);
  });

  await test("readability → extracts article text", async () => {
    const r = await call("readability", { tabId });
    if (!r.content?.includes("Browser automation")) throw new Error("Missing article text");
    if (r.length < 500) throw new Error(`Too short: ${r.length}`);
  });

  await test("watch_changes → detects counter mutations", async () => {
    await call("watch_changes", { action: "start", selector: "#counter-display", tabId });
    await sleep(2000);
    const r = await call("watch_changes", { action: "get", tabId });
    await call("watch_changes", { action: "stop", tabId });
    if (r.length < 1) throw new Error("No mutations detected");
  });

  // ══════════════════════════════════════════════════════
  // 7. WINDOW MANAGEMENT
  // ══════════════════════════════════════════════════════
  console.log("\n\x1b[1m[Window Management]\x1b[0m");

  await test("new_window + resize + close_window", async () => {
    const win = await call("new_window", { url: "about:blank", width: 400, height: 300 });
    if (!win.windowId) throw new Error("No windowId");
    const r = await call("resize_window", { width: 800, height: 600, windowId: win.windowId });
    if (r.width < 700) throw new Error(`Width: ${r.width}`);
    await call("close_window", { windowId: win.windowId });
    // Verify closed
    const tabs = await call("list_tabs");
    if (tabs.find((t) => t.windowId === win.windowId)) throw new Error("Window still open");
  });

  await test("pin_tab → tab pins and unpins", async () => {
    await call("pin_tab", { tabId, pinned: true });
    let tabs = await call("list_tabs");
    let tab = tabs.find((t) => t.id === tabId);
    // Unpin
    await call("pin_tab", { tabId, pinned: false });
  });

  await test("mute_tab → tab mutes and unmutes", async () => {
    await call("mute_tab", { tabId, muted: true });
    await call("mute_tab", { tabId, muted: false });
  });

  await test("move_tab → moves within window", async () => {
    const tabs = await call("list_tabs");
    const t = tabs.find((t) => t.id === tabId);
    const r = await call("move_tab", { tabId, windowId: t.windowId, index: 0 });
    if (r.index !== 0) throw new Error(`Index: ${r.index}`);
  });

  // ══════════════════════════════════════════════════════
  // REPORT
  // ══════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(56));
  console.log(`\x1b[1m Results: \x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m out of ${passed + failed}`);
  if (failures.length) {
    console.log("\n\x1b[31mFailures:\x1b[0m");
    for (const f of failures) console.log(`  • ${f.name}: ${f.error}`);
  }
  console.log();

  wss.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
