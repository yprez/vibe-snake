#!/usr/bin/env node
// Record a smooth, in-sync gameplay clip of the game playing itself -> vibe-snake.mp4.
//
//   node tools/capture-video.mjs [difficulty] [seconds] [fps] [mode] [format] [seed]
//   e.g.  node tools/capture-video.mjs insane 120 25 maze           -> 1200x620 landscape card
//         node tools/capture-video.mjs insane 30 30 maze reel       -> 1080x1920 vertical reel
//         node tools/capture-video.mjs insane 30 30 maze reel 7     -> same, different RNG seed (new run)
//
// ONE real-time run captures both the video (CDP screencast) and the live
// generative audio (PulseAudio), so the sound always matches the picture. The
// game draws cosmetics (particles, stars, shake) from the same Math.random()
// stream as gameplay (food, power-ups), so its randomness is frame-rate
// dependent; a separate audio pass would run a different number of frames, drift
// onto a different RNG path, and play a different game (one survives, one dies).
//
// Screencast frames arrive at an irregular rate, so instead of assuming uniform
// spacing (which warps motion) we place each frame at its real timestamp and
// resample to a constant fps (default 30). That removes the judder without
// touching audio sync. If the autopilot crashes before `seconds`, the clip ends
// at the crash rather than freezing on the game-over screen. No npm deps.
//
// Requires: google-chrome, ffmpeg, Node 22+ (built-in fetch + WebSocket).
import { spawn, spawnSync, execSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync, existsSync, statSync, copyFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PAGE = "file://" + path.join(ROOT, "index.html");
const RAW = "/tmp/vibe-frames";                 // captured screencast frames
const SEQ = "/tmp/vibe-seq";                    // resampled constant-fps frames
const PORT = 9226, SINK = "vibecap", SEED = Number(process.argv[7]) || 23;
const DIFF = process.argv[2] || "insane";       // easy | medium | hard | insane
const SECONDS = Math.max(3, Number(process.argv[3]) || 30);
const FPS = Math.min(60, Math.max(20, Number(process.argv[4]) || 30));
const MODE = ["classic", "wrap", "maze"].includes(process.argv[5]) ? process.argv[5] : "classic";
const FORMAT = process.argv[6] === "reel" ? "reel" : "card";   // card: 1200x620 landscape | reel: 1080x1920 (9:16)
const REEL = FORMAT === "reel";
const W = REEL ? 540 : 1200, WIN_H = REEL ? 960 : 760, CROP_H = REEL ? 1920 : 620;  // reel: exact 9:16 viewport (set via device metrics), rendered 2x to 1080x1920
const REEL_SPEED = 1;                            // reel: game-clock multiplier (1 = real game speed); audio stays in tune (Web Audio keeps its own clock)
const OUT = path.join(ROOT, REEL ? "vibe-snake-reel.mp4" : "vibe-snake.mp4");
const DEATH_TAIL = REEL ? 1.0 : 0.5;             // seconds kept after a crash (reel waits out the death animation)

const have = (b) => spawnSync("sh", ["-c", `command -v ${b}`]).status === 0;
const run = (b, a) => { const r = spawnSync(b, a, { stdio: ["ignore", "inherit", "inherit"] }); if (r.status !== 0) throw new Error(b + " failed"); };
function audioHasSignal(wav) {
  try {
    const e = spawnSync("ffmpeg", ["-hide_banner", "-i", wav, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" }).stderr || "";
    const m = e.match(/mean_volume:\s*(-?[0-9.]+)/);
    return m ? parseFloat(m[1]) > -80 : false;   // < -80 dB == effectively silence
  } catch { return false; }
}

if (!have("google-chrome")) { console.error("need google-chrome on PATH"); process.exit(1); }
if (!have("ffmpeg")) { console.error("need ffmpeg on PATH"); process.exit(1); }

// Optional throwaway sink we can record cleanly. Skipped if no PulseAudio.
let audioMod = null;
if (have("pactl")) {
  try { audioMod = execSync(`pactl load-module module-null-sink sink_name=${SINK} sink_properties=device.description=${SINK}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); if (!/^\d+$/.test(audioMod)) audioMod = null; } catch { audioMod = null; }
}
const withAudio = !!audioMod;

rmSync(RAW, { recursive: true, force: true }); mkdirSync(RAW, { recursive: true });
rmSync(SEQ, { recursive: true, force: true }); mkdirSync(SEQ, { recursive: true });

const chrome = spawn("google-chrome", [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
  "--autoplay-policy=no-user-gesture-required", `--window-size=${W},${WIN_H}`,
  `--remote-debugging-port=${PORT}`, "--remote-allow-origins=*", "about:blank",
], { stdio: "ignore", env: withAudio ? { ...process.env, PULSE_SINK: SINK } : process.env });

const frames = [];                               // { file, t }  t = metadata.timestamp (seconds)
let n = 0, audioProc = null;

try {
  let tg;
  for (let i = 0; i < 80 && !tg; i++) { try { tg = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === "page"); } catch {} if (!tg) await sleep(100); }
  if (!tg) throw new Error("Chrome DevTools endpoint never came up");
  const ws = new WebSocket(tg.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const pend = new Map();
  const send = (m, p = {}) => new Promise((r) => { const id = (send.n = (send.n || 0) + 1); pend.set(id, r); ws.send(JSON.stringify({ id, method: m, params: p })); });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); return; }
    if (m.method === "Page.screencastFrame") {
      const file = `${RAW}/f${String(++n).padStart(6, "0")}.jpg`;
      writeFileSync(file, Buffer.from(m.params.data, "base64"));
      frames.push({ file, t: m.params.metadata.timestamp });
      send("Page.screencastFrameAck", { sessionId: m.params.sessionId });
    }
  };

  await send("Page.enable"); await send("Runtime.enable");
  // Reel: force an exact 9:16 viewport at 2x (window-size alone leaves the viewport a few % short and crops).
  if (REEL) await send("Emulation.setDeviceMetricsOverride", { width: W, height: WIN_H, deviceScaleFactor: 2, mobile: false });
  // Freeze RNG + difficulty before any page script runs (keeps runs comparable).
  await send("Page.addScriptToEvaluateOnNewDocument", { source:
    `(function(){try{localStorage.setItem('vibesnake.diff',${JSON.stringify(DIFF)});localStorage.setItem('vibesnake.mode',${JSON.stringify(MODE)});` +
    (REEL ? `localStorage.setItem('vibesnake.zoom','large');` : ``) +
    `}catch(e){}` +
    `var s=(${SEED}>>>0)||1;Math.random=function(){s=(s+0x6D2B79F5)|0;var t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};` +
    (REEL ? `var rn=performance.now.bind(performance),T0=rn();var sc=function(x){return T0+(x-T0)*${REEL_SPEED};};performance.now=function(){return sc(rn());};var raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=function(cb){return raf(function(ts){cb(sc(ts));});};` : ``) +
    `})();` });
  await send("Page.navigate", { url: PAGE });
  await sleep(1300);

  const press = (k) => send("Runtime.evaluate", { expression: `window.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(k)}}))` });
  await press(" "); await press("i");            // start + autopilot
  await send("Runtime.evaluate", { expression:
    "(function(){var s=document.createElement('style');s.textContent=" + JSON.stringify(
      REEL
        ? "*,*::before,*::after{animation:none!important}.dpad{display:none!important}"
        : "*,*::before,*::after{animation:none!important}html,body{background:#0a0e16!important}body{justify-content:flex-start!important}.app{gap:8px!important;padding-top:8px!important}.dpad,footer{display:none!important}"
    ) + ";document.head.appendChild(s);})()" });
  await sleep(250);

  if (withAudio) audioProc = spawn("ffmpeg", ["-y", "-f", "pulse", "-i", SINK + ".monitor", "-t", String(SECONDS + 1), "-ac", "2", "-ar", "44100", `${RAW}/audio.wav`], { stdio: "ignore" });
  await send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1, maxWidth: REEL ? 1080 : W, maxHeight: REEL ? 1920 : WIN_H });

  // Run for SECONDS, but stop early (plus a short tail) if the snake crashes.
  const deadJs = "(function(){var b=document.querySelector('.board-wrap'),o=document.querySelector('.overlay');return !!((b&&b.classList.contains('dying'))||(o&&o.classList.contains('show')));})()";
  const t0 = Date.now(); let stopAt = SECONDS * 1000, crashed = false;
  while (Date.now() - t0 < stopAt) {
    await sleep(150);
    const dead = (await send("Runtime.evaluate", { expression: deadJs, returnByValue: true })).result?.value;
    if (dead && !crashed) { crashed = true; stopAt = Math.min(stopAt, (Date.now() - t0) + DEATH_TAIL * 1000); }
  }
  await send("Page.stopScreencast");
  if (audioProc) { try { audioProc.kill("SIGINT"); } catch {} await sleep(300); }
  ws.close();

  // Place each captured frame at its true time, then sample to a constant fps.
  if (!frames.length) throw new Error("no frames captured");
  const t0s = frames[0].t;
  const span = frames[frames.length - 1].t - t0s;
  const dur = Math.max(1, Math.min(SECONDS, span));
  const outN = Math.round(dur * FPS);
  let src = 0;
  for (let k = 0; k < outN; k++) {
    const target = t0s + k / FPS;
    while (src + 1 < frames.length && frames[src + 1].t <= target) src++;
    copyFileSync(frames[src].file, `${SEQ}/o${String(k + 1).padStart(6, "0")}.jpg`);
  }

  const video = "/tmp/vibe-video.mp4", wav = `${RAW}/audio.wav`;
  // Reel: cover-scale to an exact 1080x1920 (the headless viewport runs a touch
  // shorter than the window). Card: crop the card height from the top of the window.
  const vf = REEL ? "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:0:0" : `crop=${W}:${CROP_H}:0:0`;
  run("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", `${SEQ}/o%06d.jpg`, "-vf", vf, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "medium", video]);
  const sound = withAudio && existsSync(wav) && statSync(wav).size > 40000 && audioHasSignal(wav);
  if (sound) run("ffmpeg", ["-y", "-loglevel", "error", "-i", video, "-i", wav, "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", OUT]);
  else run("ffmpeg", ["-y", "-loglevel", "error", "-i", video, "-movflags", "+faststart", "-c", "copy", OUT]);

  console.log(`wrote ${OUT}  (${MODE}/${DIFF}, ${dur.toFixed(1)}s @ ${FPS}fps, captured ${n} -> ${outN} frames, ${crashed ? "ended at crash" : "full length"}, audio: ${sound ? "yes" : "no"})`);
} finally {
  chrome.kill();
  if (audioProc) try { audioProc.kill(); } catch {}
  if (audioMod) try { execSync(`pactl unload-module ${audioMod}`); } catch {}
}
