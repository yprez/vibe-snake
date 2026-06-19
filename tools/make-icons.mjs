#!/usr/bin/env node
// Render icon.svg into the PWA PNG icons via headless Chrome (no image deps).
//
//   node tools/make-icons.mjs
//
// Writes icon-192.png, icon-512.png (manifest icons, any + maskable) and
// apple-touch-icon.png (iOS home screen). Re-run after editing icon.svg.
// Requires google-chrome on PATH and Node 22+.
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SVG = readFileSync(path.join(ROOT, "icon.svg"), "utf8");
const SIZES = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];
const PORT = 9240;

const chrome = spawn("google-chrome", [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--force-device-scale-factor=1", `--remote-debugging-port=${PORT}`, "--remote-allow-origins=*", "about:blank",
], { stdio: "ignore" });
const rpc = (ws, p) => (m, par = {}) => new Promise((r) => { const id = rpc.n = (rpc.n || 0) + 1; p.set(id, r); ws.send(JSON.stringify({ id, method: m, params: par })); });

try {
  let tg;
  for (let i = 0; i < 80 && !tg; i++) { try { tg = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === "page"); } catch {} if (!tg) await sleep(100); }
  if (!tg) throw new Error("Chrome DevTools endpoint never came up");
  const ws = new WebSocket(tg.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const pend = new Map(); const send = rpc(ws, pend);
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
  await send("Page.enable");
  for (const { name, size } of SIZES) {
    const html = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;padding:0}svg{display:block;width:${size}px;height:${size}px}</style>${SVG}`;
    await send("Page.navigate", { url: "data:text/html;base64," + Buffer.from(html).toString("base64") });
    await sleep(250);
    const { data } = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
    writeFileSync(path.join(ROOT, name), Buffer.from(data, "base64"));
    console.log(`wrote ${name} (${size}x${size})`);
  }
  ws.close();
} finally { chrome.kill(); }
