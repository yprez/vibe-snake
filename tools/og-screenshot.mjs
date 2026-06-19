#!/usr/bin/env node
// Regenerate og.png as a real screenshot of the running game.
//
//   node tools/og-screenshot.mjs
//
// Drives the actual index.html in headless Chrome (via the DevTools Protocol,
// using Node's built-in fetch + WebSocket, no npm deps): boots the page, starts
// a game, turns on the autopilot so the snake plays itself for a few seconds,
// then captures the 1200x630 viewport. Requires `google-chrome` on PATH and
// Node 22+ (built-in WebSocket).
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PAGE = "file://" + path.join(ROOT, "index.html");
const OUT = path.join(ROOT, "og.png");
const PORT = 9222;
const SEED = Number(process.argv[2]) || 23; // frozen RNG seed -> reproducible frame; override: node tools/og-screenshot.mjs <seed>
const TIME_SCALE = 6;   // accelerate gameplay so the snake grows fast
const PLAY_MS = 8000;   // real ms of (accelerated) autopilot play before the shot

const chrome = spawn("google-chrome", [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--force-device-scale-factor=1", "--window-size=1200,760",
  `--remote-debugging-port=${PORT}`, "--remote-allow-origins=*", "about:blank",
], { stdio: "ignore" });

const rpc = (ws, pending) => (method, params = {}) =>
  new Promise((res) => { const id = rpc.n = (rpc.n || 0) + 1; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });

try {
  // Wait for the DevTools endpoint, then grab the page target.
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      target = list.find((t) => t.type === "page");
    } catch { /* not up yet */ }
    if (!target) await sleep(100);
  }
  if (!target) throw new Error("Chrome DevTools endpoint never came up");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  const send = rpc(ws, pending);

  await send("Page.enable");
  await send("Runtime.enable");
  // Freeze RNG before any page script runs, so the whole run (food, power-ups,
  // particles, stars) is deterministic and the frame is reproducible.
  await send("Page.addScriptToEvaluateOnNewDocument", { source:
    `(function(){var s=(${SEED}>>>0)||1;Math.random=function(){s=(s+0x6D2B79F5)|0;` +
    `var t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;` +
    `return((t^(t>>>14))>>>0)/4294967296;};` +
    // time dilation: run the game clock TIME_SCALE x faster so the snake grows quickly
    `var rn=performance.now.bind(performance),t0=rn(),SC=${TIME_SCALE};` +
    `var sc=function(x){return t0+(x-t0)*SC;};performance.now=function(){return sc(rn());};` +
    `var raf=window.requestAnimationFrame.bind(window);` +
    `window.requestAnimationFrame=function(cb){return raf(function(ts){cb(sc(ts));});};})();` });
  await send("Page.navigate", { url: PAGE });
  await sleep(1300); // boot + attract mode settling

  const evalJs = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result?.value;

  // Dispatch real key events: Space starts the game, "i" turns on autopilot
  // so the snake plays (and survives) on its own for a lively frame.
  const press = (key) => send("Runtime.evaluate", {
    expression: `window.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)}}))`,
  });
  await press(" ");
  await press("i");
  await sleep(PLAY_MS);  // accelerated autopilot play -> long snake

  // Reframe for a clean 1200x630 card where the board fills the frame: render
  // tall (so the board itself computes large), fill any gap with the dark theme
  // colour, top-align, tighten spacing, and drop the footer + touch d-pad
  // (headless Chrome matches hover:none, so the d-pad would otherwise show).
  // Autopilot is still on here, so the snake can't crash while we restyle.
  await send("Runtime.evaluate", { expression:
    "(function(){var s=document.createElement('style');" +
    "s.textContent='html,body{background:#0a0e16!important}body{justify-content:flex-start!important}.app{gap:8px!important;padding-top:8px!important}.dpad,footer{display:none!important}';" +
    "document.head.appendChild(s);})()" });
  await sleep(200);
  await press("i");      // autopilot off -> drops the AUTO badge
  await sleep(60);       // tiny settle; snake barely moves before the shot

  console.log(`seed ${SEED} -> score ${await evalJs("document.getElementById('score').textContent")}, length ${await evalJs("document.getElementById('length').textContent")}`);

  const { data } = await send("Page.captureScreenshot", {
    format: "png", clip: { x: 0, y: 0, width: 1200, height: 630, scale: 1 },
  });
  writeFileSync(OUT, Buffer.from(data, "base64"));
  console.log("wrote", OUT);
  ws.close();
} finally {
  chrome.kill();
}
