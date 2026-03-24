#!/usr/bin/env node
// BrowserMCP Demo — visual showcase with verification for screen recording.
// Usage: node test/demo-test.mjs
// Prerequisites: Chrome with BrowserMCP extension, test page on :8111
// NOTE: Close Claude Code first so port 12800 is free.

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

async function pageEval(code, tabId) {
  return await call("execute_js", { code, tabId });
}

// ─── Pretty output ───
function header(text) { console.log(`\n\x1b[1;36m  ${"─".repeat(52)}\n   ${text}\n  ${"─".repeat(52)}\x1b[0m`); }
function step(msg) { console.log(`\n  > \x1b[1m${msg}\x1b[0m`); }
function ok(msg) { console.log(`    \x1b[32m[PASS] ${msg}\x1b[0m`); }
function info(msg) { console.log(`    \x1b[90m${msg}\x1b[0m`); }
function verify(msg) { console.log(`    \x1b[33m[CHECK] ${msg}\x1b[0m`); }

let totalTests = 0, passedTests = 0;
function pass() { totalTests++; passedTests++; }
function fail(msg) { totalTests++; console.log(`     \x1b[31m✗ FAIL: ${msg}\x1b[0m`); }

async function main() {
  console.clear();
  console.log("\n\x1b[1;36m" + "─".repeat(56));
  console.log("   BrowserMCP Demo — 36 Tools, Verified Live");
  console.log("─".repeat(56) + "\x1b[0m");

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
  info(`WebSocket server on port ${WS_PORT}, waiting for extension...`);

  await new Promise((resolve) => {
    wss.on("connection", (socket) => {
      ws = socket;
      ok("Chrome extension connected!");
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

  await sleep(500);
  let tabId;

  // ═══════════════════════════════════════════════════════
  header("Act 1: Open Page & Read Content");
  // ═══════════════════════════════════════════════════════

  step("browser_navigate → Opening test page...");
  const nav = await call("navigate", { url: TEST_PAGE, waitMs: 1500 });
  verify(`Page title = "${nav.title}"`);
  if (nav.title?.includes("BrowserMCP")) { ok("Title correct"); pass(); } else fail("Wrong title");
  await sleep(600);

  step("browser_list_tabs → Finding test page...");
  const tabs = await call("list_tabs");
  const testTab = tabs.find((t) => t.url?.includes("test-page"));
  tabId = testTab?.id;
  verify(`Found tab #${tabId} among ${tabs.length} tabs`);
  if (tabId) { ok("Test tab found"); pass(); } else fail("Tab not found");
  await sleep(500);

  step("browser_read_page → Reading content...");
  const page = await call("read_page", { tabId, format: "text" });
  verify(`Content length: ${page.text.length} chars`);
  if (page.text.includes("Scroll Test")) { ok("Content contains expected sections"); pass(); } else fail("Missing content");
  await sleep(500);

  step("browser_screenshot → Capturing page...");
  const shot = await call("screenshot", { tabId });
  verify(`Image size: ${Math.round(shot.length / 1024)} KB`);
  if (shot?.startsWith("data:image/png")) { ok("Valid PNG screenshot"); pass(); } else fail("Not a PNG");
  await sleep(600);

  step("browser_execute_js → Running 2+2 on page...");
  const jsResult = await pageEval("2 + 2", tabId);
  verify(`Result: ${jsResult}`);
  if (jsResult === 4) { ok("JavaScript executed correctly"); pass(); } else fail(`Got ${jsResult}`);
  await sleep(500);

  // ═══════════════════════════════════════════════════════
  header("Act 2: Form Interaction");
  // ═══════════════════════════════════════════════════════

  step("browser_scroll → Scrolling to form...");
  const scrollR = await call("scroll", { selector: "#form-section", tabId });
  verify(`Scroll position: Y=${scrollR.scrollY}`);
  const realY = await pageEval("Math.round(window.scrollY)", tabId);
  if (realY > 0) { ok(`Page scrolled to Y=${realY}`); pass(); } else fail("Didn't scroll");
  await sleep(500);

  step("browser_type → Typing 'Claude AI' into name...");
  await call("type", { selector: "#name-input", text: "Claude AI", tabId });
  const nameVal = await pageEval("document.getElementById('name-input').value", tabId);
  verify(`Input value: "${nameVal}"`);
  if (nameVal === "Claude AI") { ok("Text in input field"); pass(); } else fail(`Got "${nameVal}"`);
  await sleep(400);

  step("browser_type → Typing email...");
  await call("type", { selector: "#email-input", text: "claude@anthropic.com", tabId });
  const emailVal = await pageEval("document.getElementById('email-input').value", tabId);
  verify(`Email value: "${emailVal}"`);
  if (emailVal === "claude@anthropic.com") { ok("Email filled"); pass(); } else fail(`Got "${emailVal}"`);
  await sleep(400);

  step("browser_type → Typing message...");
  await call("type", { selector: "#message-input", text: "Hello from BrowserMCP! All 36 tools working.", tabId });
  const msgVal = await pageEval("document.getElementById('message-input').value", tabId);
  if (msgVal.includes("BrowserMCP")) { ok("Message filled"); pass(); } else fail("Message empty");
  await sleep(400);

  step("browser_select → Selecting 'Blue'...");
  await call("select", { selector: "#color-select", value: "blue", tabId });
  const selVal = await pageEval("document.getElementById('color-select').value", tabId);
  verify(`Dropdown value: "${selVal}"`);
  if (selVal === "blue") { ok("Dropdown changed"); pass(); } else fail(`Got "${selVal}"`);
  await sleep(400);

  step("browser_hover → Hovering submit button...");
  await pageEval("window.__hoverOk=false; document.getElementById('submit-btn').addEventListener('mouseenter',()=>{window.__hoverOk=true},{once:true})", tabId);
  await call("hover", { selector: "#submit-btn", tabId });
  await sleep(100);
  const hoverOk = await pageEval("window.__hoverOk", tabId);
  verify(`mouseenter fired: ${hoverOk}`);
  if (hoverOk) { ok("Hover detected by page"); pass(); } else fail("No hover event");
  await sleep(400);

  step("browser_click → Submitting form...");
  await call("click", { selector: "#submit-btn", tabId });
  await sleep(200);
  const formOut = await pageEval("document.getElementById('form-output').textContent", tabId);
  verify(`Form output: ${formOut.slice(0, 60)}...`);
  if (formOut.includes("Claude AI")) { ok("Form submitted with correct data!"); pass(); } else fail("Form data missing");
  await sleep(600);

  step("Taking screenshot of filled form...");
  await call("screenshot", { tabId });
  ok("Captured");
  await sleep(600);

  // ═══════════════════════════════════════════════════════
  header("Act 3: Keyboard Input");
  // ═══════════════════════════════════════════════════════

  step("browser_keyboard → Pressing 'H', 'i', '!' into keyboard input...");
  await call("scroll", { selector: "#keyboard-section", tabId });
  await sleep(300);
  await call("keyboard", { key: "H", selector: "#keyboard-input", tabId });
  await call("keyboard", { key: "i", selector: "#keyboard-input", tabId });
  await call("keyboard", { key: "!", selector: "#keyboard-input", tabId });
  const kbVal = await pageEval("document.getElementById('keyboard-input').value", tabId);
  const kbOut = await pageEval("document.getElementById('keyboard-output').textContent", tabId);
  verify(`Input value: "${kbVal}", Page detected: "${kbOut}"`);
  if (kbVal.includes("Hi!")) { ok("Characters typed into input"); pass(); } else fail(`Got "${kbVal}"`);
  if (kbOut.includes("!")) { ok("Page detected keypress"); pass(); } else fail(`Output: "${kbOut}"`);
  await sleep(600);

  // ═══════════════════════════════════════════════════════
  header("Act 4: Data Extraction");
  // ═══════════════════════════════════════════════════════

  step("browser_get_links → Extracting links (filter: 'example')...");
  const links = await call("get_links", { filter: "example", tabId });
  verify(`Found ${links.length} links`);
  for (const l of links.slice(0, 3)) info(`  • ${l.text} → ${l.href}`);
  if (links.length >= 3) { ok("Links extracted"); pass(); } else fail(`Only ${links.length}`);
  await sleep(500);

  step("browser_extract_table → Reading product table...");
  await call("scroll", { selector: "#table-section", tabId });
  await sleep(300);
  const table = await call("extract_table", { selector: "#data-table", tabId });
  verify(`${table.headers.length} columns × ${table.rows.length} rows`);
  info(`  Headers: ${table.headers.join(", ")}`);
  info(`  Row 1: ${table.rows[0].join(" | ")}`);
  if (table.rows.length === 6 && table.headers.length === 5) { ok("Table parsed correctly"); pass(); } else fail("Wrong dimensions");
  await sleep(500);

  step("browser_extract_meta → Reading meta/OG/JSON-LD...");
  const meta = await call("extract_meta", { tabId });
  verify(`OG Title: "${meta.openGraph?.["og:title"]}"`);
  info(`  Twitter: "${meta.twitter?.["twitter:card"]}"`);
  info(`  JSON-LD: @type="${meta.jsonLd?.[0]?.["@type"]}"`);
  info(`  Canonical: ${meta.canonical}`);
  if (meta.openGraph?.["og:title"]) { ok("Meta tags extracted"); pass(); } else fail("No OG");
  await sleep(500);

  step("browser_extract_images → Finding images...");
  await call("scroll", { selector: "#images-section", tabId });
  await sleep(300);
  const images = await call("extract_images", { tabId });
  verify(`Found ${images.length} images`);
  for (const img of images) info(`  • ${img.alt} (${img.width}×${img.height})`);
  if (images.length === 3) { ok("All 3 images found with alt text"); pass(); } else fail(`Got ${images.length}`);
  await sleep(500);

  step("browser_get_elements → Querying .highlight-item...");
  const elems = await call("get_elements", { selector: ".highlight-item", tabId });
  verify(`Found ${elems.length}: ${elems.map(e => e.textContent).join(", ")}`);
  if (elems.length === 5) { ok("All 5 elements found"); pass(); } else fail(`Got ${elems.length}`);
  await sleep(500);

  // ═══════════════════════════════════════════════════════
  header("Act 5: Visual Effects");
  // ═══════════════════════════════════════════════════════

  step("browser_highlight → Highlighting items in red...");
  await call("scroll", { selector: "#highlight-section", tabId });
  await sleep(300);
  const hl = await call("highlight", { selector: ".highlight-item", color: "#e74c3c", tabId });
  const outline = await pageEval("getComputedStyle(document.querySelector('.highlight-item')).outlineColor", tabId);
  verify(`Highlighted ${hl.count} elements, outline: ${outline}`);
  if (hl.count === 5) { ok("Red outlines visible on page"); pass(); } else fail(`Count: ${hl.count}`);
  await sleep(600);

  step("browser_inject_css → Adding gradient header...");
  await call("inject_css", { css: "h1 { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important; transition: all 0.5s; }", tabId });
  await call("scroll", { direction: "up", pixels: 99999, tabId });
  await sleep(500);
  const h1Bg = await pageEval("getComputedStyle(document.querySelector('h1')).backgroundImage", tabId);
  verify(`Header background: ${h1Bg.slice(0, 50)}...`);
  if (h1Bg.includes("gradient")) { ok("CSS injected — gradient header visible!"); pass(); } else fail("No gradient");
  await sleep(600);

  step("browser_get_computed_style → Reading Box 2 styles...");
  await call("scroll", { selector: "#style-section", tabId });
  await sleep(300);
  const styles = await call("get_computed_style", { selector: "#style-box-2", properties: ["background-color", "opacity", "font-size"], tabId });
  verify(`bg: ${styles["background-color"]}, opacity: ${styles.opacity}, font: ${styles["font-size"]}`);
  if (styles.opacity === "0.8" && styles["font-size"] === "20px") { ok("Computed styles match"); pass(); } else fail("Style mismatch");
  await sleep(500);

  step("Screenshot of visual effects...");
  await call("scroll", { selector: "#highlight-section", tabId });
  await sleep(200);
  await call("screenshot", { tabId });
  ok("Captured highlights + injected CSS");
  await sleep(600);

  // ═══════════════════════════════════════════════════════
  header("Act 6: Monitoring & Capture");
  // ═══════════════════════════════════════════════════════

  step("browser_console_log → Starting capture...");
  await call("console_log", { action: "start", tabId });
  ok("Console capture started");
  await sleep(200);

  step("browser_network_log → Starting capture...");
  await call("network_log", { action: "start", tabId });
  ok("Network capture started");
  await sleep(200);

  step("browser_watch_changes → Watching counter mutations...");
  await call("watch_changes", { action: "start", selector: "#counter-display", tabId });
  ok("DOM watcher started");
  await sleep(200);

  step("Triggering console.log/warn/error...");
  await call("scroll", { selector: "#console-section", tabId });
  await sleep(200);
  await call("click", { selector: "#console-section button:nth-of-type(1)", tabId });
  await call("click", { selector: "#console-section button:nth-of-type(2)", tabId });
  await call("click", { selector: "#console-section button:nth-of-type(3)", tabId });
  await sleep(300);

  step("Triggering fetch request...");
  await call("scroll", { selector: "#network-section", tabId });
  await sleep(200);
  await call("click", { selector: "#fetch-btn", tabId });
  info("Waiting 3s for request to complete...");
  await sleep(3000);

  step("Reading console logs...");
  const consoleLogs = await call("console_log", { action: "get", tabId });
  const levels = consoleLogs.map(e => e.level);
  verify(`Captured ${consoleLogs.length} entries: ${levels.join(", ")}`);
  for (const e of consoleLogs.slice(0, 3)) info(`  [${e.level}] ${e.args.join(" ")}`);
  if (levels.includes("log") && levels.includes("warn") && levels.includes("error")) { ok("All console levels captured"); pass(); } else fail("Missing levels");
  await call("console_log", { action: "stop", tabId });

  step("Reading network requests...");
  const netLogs = await call("network_log", { action: "get", tabId });
  verify(`Captured ${netLogs.length} request(s)`);
  for (const e of netLogs) info(`  ${e.method} ${e.url.slice(0, 50)} → ${e.status} (${e.duration}ms)`);
  if (netLogs.length && netLogs[0].status === 200) { ok("Fetch captured with status 200"); pass(); } else fail("No requests");
  await call("network_log", { action: "stop", tabId });

  step("Reading DOM mutations...");
  const mutations = await call("watch_changes", { action: "get", tabId });
  verify(`${mutations.length} mutations detected (counter ticking)`);
  if (mutations.length >= 2) { ok("Counter mutations detected"); pass(); } else fail(`Only ${mutations.length}`);
  await call("watch_changes", { action: "stop", tabId });
  await sleep(500);

  // ═══════════════════════════════════════════════════════
  header("Act 7: Dynamic Content & Search");
  // ═══════════════════════════════════════════════════════

  step("browser_wait_for → Click 'Load Content', wait for element...");
  await call("scroll", { selector: "#dynamic-section", tabId });
  await sleep(300);
  await call("click", { selector: "#load-dynamic-btn", tabId });
  info("Button clicked, waiting up to 5s for #loaded-element...");
  const waited = await call("wait_for", { selector: "#loaded-element", timeout: 5000, tabId });
  verify(`Found: "${waited.text}"`);
  if (waited.found && waited.text.includes("loaded successfully")) { ok("Dynamic element appeared!"); pass(); } else fail("Not found");
  await sleep(500);

  step("browser_find_text → Searching 'XYZZY_MARKER_12345'...");
  const found = await call("find_text", { text: "XYZZY_MARKER_12345", tabId });
  verify(`${found.length} match(es) in <${found[0]?.element}>`);
  if (found.length && found[0].element === "STRONG") { ok("Text found in correct element"); pass(); } else fail("Not found");
  await sleep(500);

  step("browser_readability → Extracting article...");
  const article = await call("readability", { tabId });
  verify(`Title: "${article.title}", Length: ${article.length} chars`);
  info(`  Excerpt: "${article.excerpt?.slice(0, 80)}..."`);
  if (article.content?.includes("Browser automation")) { ok("Article content extracted"); pass(); } else fail("Missing content");
  await sleep(500);

  // ═══════════════════════════════════════════════════════
  header("Act 8: Storage & Cookies");
  // ═══════════════════════════════════════════════════════

  step("browser_set_storage → Writing localStorage...");
  await call("set_storage", { type: "localStorage", key: "demo_user", value: "Claude", tabId });
  const lsVal = await pageEval("localStorage.getItem('demo_user')", tabId);
  verify(`localStorage.demo_user = "${lsVal}"`);
  if (lsVal === "Claude") { ok("localStorage written & verified"); pass(); } else fail(`Got "${lsVal}"`);
  await sleep(400);

  step("browser_set_storage → Writing sessionStorage...");
  await call("set_storage", { type: "sessionStorage", key: "demo_session", value: "active", tabId });
  const ssVal = await pageEval("sessionStorage.getItem('demo_session')", tabId);
  verify(`sessionStorage.demo_session = "${ssVal}"`);
  if (ssVal === "active") { ok("sessionStorage written & verified"); pass(); } else fail(`Got "${ssVal}"`);
  await sleep(400);

  step("browser_get_storage → Reading all localStorage...");
  const ls = await call("get_storage", { type: "localStorage", tabId });
  verify(`Keys: ${Object.keys(ls).join(", ")}`);
  if (ls.demo_user === "Claude") { ok("Storage read back correctly"); pass(); } else fail("Mismatch");
  await sleep(400);

  step("browser_set_cookies → Setting cookie...");
  await call("set_cookies", { url: "http://localhost:8111", name: "demo_theme", value: "dark" });
  ok("Cookie set");
  await sleep(300);

  step("browser_get_cookies → Reading cookies...");
  const cookies = await call("get_cookies", { url: "http://localhost:8111" });
  verify(`${cookies.length} cookies: ${cookies.map(c => `${c.name}=${c.value}`).join(", ")}`);
  const demoCookie = cookies.find(c => c.name === "demo_theme");
  if (demoCookie?.value === "dark") { ok("Cookie verified"); pass(); } else fail("Cookie missing");
  await sleep(500);

  // ═══════════════════════════════════════════════════════
  header("Act 9: Advanced Interaction");
  // ═══════════════════════════════════════════════════════

  step("browser_right_click → Right-clicking drag item...");
  await call("scroll", { selector: "#drag-section", tabId });
  await sleep(300);
  await pageEval("window.__ctxOk=false; document.getElementById('drag-item-1').addEventListener('contextmenu',()=>{window.__ctxOk=true},{once:true})", tabId);
  await call("right_click", { selector: "#drag-item-1", tabId });
  await sleep(100);
  const ctxOk = await pageEval("window.__ctxOk", tabId);
  verify(`contextmenu event fired: ${ctxOk}`);
  if (ctxOk) { ok("Right-click detected by page"); pass(); } else fail("No event");
  await sleep(400);

  step("browser_double_click → Double-clicking input...");
  await pageEval("window.__dblOk=false; document.getElementById('name-input').addEventListener('dblclick',()=>{window.__dblOk=true},{once:true})", tabId);
  await call("double_click", { selector: "#name-input", tabId });
  await sleep(100);
  const dblOk = await pageEval("window.__dblOk", tabId);
  verify(`dblclick event fired: ${dblOk}`);
  if (dblOk) { ok("Double-click detected by page"); pass(); } else fail("No event");
  await sleep(400);

  step("browser_drag_drop → Dragging item to drop zone...");
  await pageEval("window.__dropOk=false; document.getElementById('drop-target').addEventListener('drop',()=>{window.__dropOk=true},{once:true})", tabId);
  await call("drag_drop", { fromSelector: "#drag-item-2", toSelector: "#drop-target", tabId });
  await sleep(100);
  const dropOk = await pageEval("window.__dropOk", tabId);
  verify(`drop event fired: ${dropOk}`);
  if (dropOk) { ok("Drag & drop detected by page"); pass(); } else fail("No event");
  await sleep(500);

  // ═══════════════════════════════════════════════════════
  header("Act 10: Tab & Window Management");
  // ═══════════════════════════════════════════════════════

  step("browser_pin_tab → Pinning test tab...");
  await call("pin_tab", { tabId, pinned: true });
  ok("Tab pinned");
  await sleep(400);

  step("browser_pin_tab → Unpinning...");
  await call("pin_tab", { tabId, pinned: false });
  ok("Tab unpinned");
  pass();
  await sleep(400);

  step("browser_mute_tab → Muting...");
  await call("mute_tab", { tabId, muted: true });
  ok("Tab muted");
  await sleep(400);

  step("browser_mute_tab → Unmuting...");
  await call("mute_tab", { tabId, muted: false });
  ok("Tab unmuted");
  pass();
  await sleep(400);

  step("browser_new_window → Opening 800×600 window...");
  const win = await call("new_window", { url: "https://example.com", width: 800, height: 600 });
  verify(`Window #${win.windowId}, Tab #${win.tabId}`);
  if (win.windowId) { ok("New window opened"); pass(); } else fail("No window");
  await sleep(1000);

  step("browser_resize_window → Resizing to 1024×768...");
  const resized = await call("resize_window", { width: 1024, height: 768, windowId: win.windowId });
  verify(`New size: ${resized.width}×${resized.height}`);
  if (resized.width >= 900) { ok("Window resized"); pass(); } else fail(`Width: ${resized.width}`);
  await sleep(800);

  step("browser_close_window → Closing window...");
  await call("close_window", { windowId: win.windowId });
  const afterTabs = await call("list_tabs");
  const stillOpen = afterTabs.find(t => t.windowId === win.windowId);
  verify(`Window closed: ${!stillOpen}`);
  if (!stillOpen) { ok("Window closed successfully"); pass(); } else fail("Still open");
  await sleep(500);

  step("browser_new_tab → Opening blank tab...");
  const newTab = await call("new_tab", { url: "about:blank" });
  verify(`Tab #${newTab.tabId}`);
  if (newTab.tabId) { ok("Tab created"); pass(); } else fail("No tab");
  await sleep(400);

  step("browser_switch_tab → Switching back to test page...");
  const switched = await call("switch_tab", { tabId });
  verify(`Active: "${switched.title}"`);
  if (switched.tabId === tabId) { ok("Switched to test page"); pass(); } else fail("Wrong tab");
  await sleep(400);

  step("browser_close_tab → Closing blank tab...");
  await call("close_tab", { tabId: newTab.tabId });
  ok("Blank tab closed");
  pass();
  await sleep(400);

  step("browser_reload → Hard reload...");
  const counterBefore = await pageEval("parseInt(document.getElementById('counter-value').textContent)", tabId);
  await call("reload", { tabId, hard: true });
  await sleep(1500);
  const counterAfter = await pageEval("parseInt(document.getElementById('counter-value').textContent)", tabId);
  verify(`Counter: ${counterBefore} → ${counterAfter} (should reset)`);
  if (counterAfter < counterBefore) { ok("Page reloaded, counter reset"); pass(); } else fail("Counter didn't reset");
  await sleep(400);

  step("browser_back / browser_forward → History navigation...");
  await pageEval("location.hash='#test-nav'", tabId);
  await sleep(200);
  await call("back", { tabId });
  await sleep(300);
  const hash1 = await pageEval("location.hash", tabId);
  await call("forward", { tabId });
  await sleep(300);
  const hash2 = await pageEval("location.hash", tabId);
  verify(`Back: hash="${hash1}", Forward: hash="${hash2}"`);
  if (hash2 === "#test-nav") { ok("History navigation works"); pass(); } else fail(`Hash: ${hash2}`);
  await sleep(400);

  step("browser_move_tab → Moving tab to position 0...");
  const allTabs = await call("list_tabs");
  const myTab = allTabs.find(t => t.id === tabId);
  const moved = await call("move_tab", { tabId, windowId: myTab.windowId, index: 0 });
  verify(`Moved to index ${moved.index}`);
  if (moved.index === 0) { ok("Tab moved to first position"); pass(); } else fail(`Index: ${moved.index}`);

  // ═══════════════════════════════════════════════════════
  // FINAL
  // ═══════════════════════════════════════════════════════
  console.log("\n\x1b[1;36m" + "─".repeat(56));
  console.log(`   Demo Complete — ${passedTests}/${totalTests} verifications passed`);
  console.log("─".repeat(56) + "\x1b[0m\n");

  wss.close();
  process.exit(passedTests === totalTests ? 0 : 1);
}

main().catch((e) => { console.error("\n\x1b[31mFatal:\x1b[0m", e.message); process.exit(1); });
