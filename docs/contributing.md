# Working on the game

## Running it locally

Edit `../index.html` and reload the browser. Publishing is a separate step (see Build and deploy below).

```bash
open index.html            # macOS
xdg-open index.html        # Linux
python3 -m http.server 8000   # optional: serve at http://localhost:8000
```

A server is only needed if you add features that browsers gate behind http(s) (service workers, some clipboard paths). Plain file open is fine for everything currently in the game.

## Conventions

- **Self-contained.** No frameworks, no external fonts or assets, no network calls. The favicon is an inline SVG data URI.
- **Vanilla, ES5-ish.** `var`, function declarations, classic `for` loops. The whole script is one IIFE under `"use strict"`, which keeps it broadly compatible.
- **Section banners.** Keep the `// ---------- Name ----------` comments; they are how you navigate the file.
- **Match the surrounding style.** Terse, single-purpose functions; canvas drawing helpers grouped together.
- **Reduced motion.** If you add motion, gate it on `reduceMotion` like shake, tilt, and the death animation do.
- **Docs.** When you change a mechanic or constant, update `gameplay.md`; when you change structure, update `architecture.md`. No line numbers in docs.

## Validate without a browser

The JS is inside an HTML file, so there is no `node` entry point, but you can still catch syntax errors and most runtime/reference errors headlessly. Two checks are worth running after edits.

**1. Syntax (parse-only):**

```bash
node -e 'const s=require("fs").readFileSync("index.html","utf8").match(/<script>([\s\S]*?)<\/script>/)[1]; new Function(s); console.log("JS syntax: OK");'
```

**2. Boot + run the loop against a stubbed DOM/canvas.** Stub `document`, `window`, `canvas.getContext` (a Proxy that returns no-op functions and gradient stubs), `localStorage`, `performance.now`, and `requestAnimationFrame` (capture the callback), then evaluate the script and call the captured loop callback for N frames with an advancing timestamp. Because attract mode runs while `state === "ready"`, those frames exercise the full AI, every draw path, theming, and tilt. This is how regressions in `aiNextDir`, `render`, and boot get caught before opening a browser. Vary `window.innerWidth/innerHeight` and `matchMedia` to cover desktop, mobile (coarse pointer), and ultrawide.

**3. Algorithm sims.** `tools/ai-sim.mjs` benchmarks the autopilot over many simulated games. It extracts the live `ai*` functions straight from `index.html` and runs them against a faithful copy of the grid, movement, and growth rules, then reports death rate, survival, and the lengths reached. Re-run it after any change to `aiNextDir` or its helpers:

```bash
node tools/ai-sim.mjs            # 40 games per board, tight boards
node tools/ai-sim.mjs 100 3000   # more games, higher tick cap
```

For a one-off math check of some other piece, a throwaway `.mjs` in `/tmp` is still fine.

## How to add a theme

1. Add an entry to `THEMES` keyed by an id. Copy the shape of `neon`: `css` (the CSS variables: `bg`, `bgGlow`, `emerald`, `emeraldLight`, `rose`, `gold`, `text`, `muted`, `board`), `boardA`/`boardB`, `grid`, `checker`, `starA`/`starB`, `auraRGB`, the snake `sH`/`sT` HSL bases, `rainbow` (true only if combo should cycle hue), and `food`/`foodGlow`/`leaf`.
2. Add it to `themeOpts` in `showStart` so it appears in the picker.

`applyTheme` already wires the rest (CSS variables for chrome, `THEME` for canvas).

## How to add a power-up

1. Add an entry to `POWERS` (colours, `glow`, `ring`, `label`, and `dur` if timed).
2. Give it odds in `choosePower`.
3. Draw its on-board glyph in `drawPowerGlyph`.
4. Apply its effect in `onBonus`. For a timed effect, add a key to `effects` and `FX_KEYS`, count it down in `loop`, add a HUD chip in the markup + CSS, and read it where it acts (see how `slowmo`, `phase`, `magnet` are consumed).
5. If it changes length, set its `LEN_MULT` and make sure `bonusGrow` and the autopilot's `aiSimulate` growth amount agree.

## How to add a mode

1. Add an entry to `MODES` (`wrap`, `maze` flags).
2. Add it to `modeOpts` in `showStart`.
3. If it needs obstacles or special movement, extend `buildObstacles` and the wall/wrap branch in `tick`. The AI already reads `MODES[currentMode].wrap` and `obstacles`, so it adapts for free.

## Social preview image

`og.png` (the link-preview image referenced by the Open Graph tags) is a real screenshot of the running game. Regenerate it after notable UI changes:

```bash
node tools/og-screenshot.mjs
```

It drives `index.html` in headless Chrome over the DevTools Protocol (Node's built-in `fetch` + `WebSocket`, no npm deps), starts a game with the autopilot so the board is lively, and captures the 1200x630 viewport. Requires `google-chrome` on PATH and Node 22+.

## Gameplay clip

Record a smooth MP4 of the game playing itself (autopilot):

```bash
node tools/capture-video.mjs [difficulty] [seconds] [fps] [mode]   # e.g. insane 120 25 maze
```

One real-time run captures the video (CDP screencast) and the live generative audio (PulseAudio) together, so the sound always matches the picture. This matters because the game draws cosmetics from the same `Math.random()` stream as gameplay, so a separate audio pass would run a different number of frames and play a different game (one survives, one dies). Screencast frames arrive unevenly, so each is placed at its real timestamp and resampled to a constant fps (default 30), which removes judder without desyncing audio. If the autopilot crashes before `seconds`, the clip ends at the crash instead of freezing on the game-over screen. With no PulseAudio stack the clip is silent. Output is `vibe-snake.mp4` (gitignored; a promo asset, not repo content). Requires `google-chrome`, `ffmpeg`, and Node 22+.

## Build and deploy

- **Publish build.** `node tools/build.mjs` copies the public allowlist (`index.html`, `og.png`, `.nojekyll`, `LICENSE`, and `CNAME` or `robots.txt` if present) into `dist/`. That folder is the only thing published, so repo internals stay off the web. `dist/` is gitignored and rebuilt in CI.
- **Deploy.** `.github/workflows/pages.yml` runs the build and deploys `dist/` to GitHub Pages on every push to `main`. Set the repo's Pages source to "GitHub Actions" once. See the top-level `../README.md` for the exact steps.
- **Commits.** Commit to `main`. Keep subjects imperative and explain the "why" in the body. Commits carry no AI attribution (suppressed via `.claude/settings.json`).
