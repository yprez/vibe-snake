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

## Promo media

The social preview image (`og.png`) and the social/reel videos are produced by the
promo tooling, which lives in a separate private repo
(`og-screenshot.mjs` and `capture-video.mjs`). Those tools drive this `index.html` in
headless Chrome; point them at a different checkout with the `VIBE_SNAKE_DIR` env var.
`og.png` is committed here because it ships with the site; the videos are not.

Gameplay is seeded from a dedicated RNG (`grand`), separate from the `Math.random()`
the cosmetics use, so a run is reproducible and frame-rate independent: the capture
tool can pin `vibesnake.seed` and slow the clock for a smoother grab without changing
which game plays out.

## Build and deploy

- **Publish build.** `node tools/build.mjs` copies the public allowlist (`index.html`, `og.png`, `.nojekyll`, `LICENSE`, and `CNAME` or `robots.txt` if present) into `dist/`. That folder is the only thing published, so repo internals stay off the web. `dist/` is gitignored and rebuilt in CI.
- **Deploy.** `.github/workflows/pages.yml` runs the build and deploys `dist/` to GitHub Pages on every push to `main`. Set the repo's Pages source to "GitHub Actions" once. See the top-level `../README.md` for the exact steps.
- **Commits.** Commit to `main`. Keep subjects imperative and explain the "why" in the body. Commits carry no AI attribution (suppressed via `.claude/settings.json`).
