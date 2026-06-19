# Architecture

Everything lives in `../index.html`: the markup, a single `<style>` block, and one `<script>` that is an IIFE (`(function(){ "use strict"; ... })()`). No modules, no bundler, no globals leak. The code is roughly ES5-style vanilla JS so it runs anywhere without transpiling.

## File layout (top to bottom)

1. **`<head>`**: meta/Open Graph/Twitter tags, an inline SVG data-URI favicon, the title.
2. **`<style>`**: CSS custom properties (`:root`), layout, the board and its overlays, HUD, overlays/menus, buttons, the on-screen d-pad, and responsive tweaks. Theme colors are CSS variables that JS rewrites at runtime.
3. **`<body>`**: the app shell: header (logo + tool buttons), HUD stats, the `.board-wrap` (canvas + effect layers + overlays), the touch d-pad, and the footer.
4. **`<script>` IIFE**, in this order: config/constants, themes, power-ups, DOM refs, state vars, prefs/persistence, helpers, sizing, starfield, obstacles, placement, lifecycle, input, the step (`tick`), scoring/eat handlers, particles/floats/ripples, rendering, the snake geometry, the autopilot AI, attract mode, tilt, the main loop, HUD, overlays, share card, audio (SFX + music), icons, toggles, events, and boot.

The script sections are separated by `// ---------- Name ----------` banners; grep those to jump around.

## State machine

`state` is a string with these values:

- **`ready`**: the start menu is showing. The attract-mode AI plays in the background (`demo === true`).
- **`playing`**: a live game; `tick()` advances on the fixed interval.
- **`paused`**: frozen; the pause menu shows (Resume / Main menu).
- **`dying`**: the short death animation (slow-mo desaturate, the snake settles into a corpse); no input.
- **`over`**: the game-over/win overlay with stats and the share card.

Transitions: `start()` (ready/over → playing), `togglePause()` (playing ↔ paused), `beginEnd(didWin)` (playing → dying, or straight to over under reduced motion), the loop's `dying` timer (dying → over), and `goToMenu()` (paused → ready, re-arming the attract demo). `primary()` routes Space/Enter to the right action for the current state.

`demo` is a separate boolean for attract mode. It is only meaningful while `state === "ready"`; the loop runs `demoTick()` then.

## Game loop and timing

`loop(now)` is a single `requestAnimationFrame` driver. Each frame:

- Computes `dt` (seconds, capped) from the rAF timestamp.
- If `playing`: advances the logic on a **fixed step**. The step fires when `now - lastTick >= interval` (scaled ×1.9 while slow-mo is active). `interval` starts at the difficulty's base and shrinks by `STEP_SPEEDUP` per apple down to that difficulty's floor (`DIFFS[currentDiff].min`). `hitStop` (a brief freeze on eating) holds `lastTick` so movement pauses without dropping the frame.
- Computes the interpolation factor `t` in `[0,1]` for smooth rendering between steps.
- Counts down `bonus.life`, the active `effects`, and the combo timer; spawns the combo trail.
- If `dying`: slows `dt` and counts down `deathTimer`.
- If `ready && demo`: runs `demoTick()` on `DEMO_INTERVAL`.
- Updates tilt, stars, particles, floats, ripples; then `render(t, now)`.

Logic runs at a fixed cadence; rendering runs every frame and interpolates. That separation keeps motion smooth and framerate-independent.

## Smooth movement model

The snake is a list of grid cells (`snake`, head first). Rendering never animates whole segments diagonally. Instead (`buildSnakePath`, `headPointAt`, `drawSnake`):

- The body is drawn through exact cell centres, so corners are clean rounded right-angles.
- The **head** pokes from `snake[1]` toward `snake[0]` by `t` (always axis-aligned).
- The **tail** recedes from `lastTailCell` toward the last cell by `t`, unless the snake is growing.

Growth uses a **queue**: `pendingGrow` is how many upcoming ticks should keep the tail in place. Eating enqueues segments (1 per apple via `FOOD_GROW`; a multiple for bonuses via `bonusGrow`), and each kept-tail tick decrements it, so the snake visibly lengthens over several steps. `grew`/`lastTailCell` are set per tick from whether the tail was kept.

Wrap mode: `tick` wraps coordinates; `strokePathBroken` lifts the pen across the seam and `headPointAt` snaps instead of streaking a line across the board.

## Rendering pipeline

`render(t, now)` draws onto one `<canvas>` sized with `devicePixelRatio`. Order (back to front):

board base gradient → starfield → grid → combo aura → eat flash → obstacles → ripples → food → bonus → snake → particles → floating text → slow-mo tint.

Two transforms wrap the scene: a random translate for **screen shake**, and a perspective **parallax tilt** applied to `.board-wrap` (not the canvas) so overlays tilt with it. Theme colors come from the `THEME` object (canvas) and CSS variables (DOM chrome).

## Subsystem map

| Subsystem | Key functions / objects |
|-----------|-------------------------|
| Config / tuning | `START_LEN`, `STEP_SPEEDUP`, `BONUS_EVERY`, `BONUS_LIFE`, `FOOD_GROW`, `LEN_MULT`, `MODES`, `DIFFS` (per-tier `base`/`min`), `DEMO_INTERVAL`, `MAX_TILT` |
| Themes | `THEMES`, `THEME`, `applyTheme` (+ CSS variables) |
| Power-ups | `POWERS`, `FX_KEYS`, `effects`, `choosePower`, `placeSpecial`, `bonusGrow`, `onBonus`, `doTrim`, `magnetPull` |
| Combo | `combo`, `addCombo`, `comboGlow`, `updateComboDisplay` |
| Sizing | `resize` (picks odd `COLS`/`ROWS` between games, rescales `cell` during play) |
| Lifecycle | `resetGame`, `start`, `beginEnd`, `togglePause`, `goToMenu`, `primary` |
| Step / rules | `tick`, `onEat`, `onBonus` |
| Geometry | `cellCenter`, `adjacent`, `headPointAt`, `buildSnakePath`, `drawSnake`, `strokePathBroken`, `drawHead` |
| Juice | `spawnBurst`, `spawnTrail`, `explodeSnake`, particles/floats/ripples, `shake`, `hitStop`, `headPulse`, `updateTilt`, `drawComboAura` (no full-screen flashing, for photosensitivity) |
| AI | `aiNextDir` and the `ai*` helpers; `demoTick`/`demoReset` (see [ai.md](ai.md)) |
| Input | `keydown` handler, pointer swipe on the canvas, the d-pad, overlay click delegation (`data-action` / `data-set`), `inputDir`, `queueDir` |
| Overlays | `showStart`, `showPaused`, `showEnd`, `seg`, `showOverlay`/`hideOverlay`; dialogs manage focus (`focusFirst`, `trapTab`, `openDialog`) and announce via `liveEl` |
| Settings / a11y | `SETTINGS`, `renderSettings`, `openSettings`/`closeSettings`, `syncSettings`, `applyToggle`, `resetPrefs`, `say` (aria-live); colourblind palette read in `bodyColors`/`drawFood` |
| HUD | `updateHUD`, `updateComboDisplay`, `updateEffectsHUD`, `updateModeBadge`, `bumpStat` |
| Audio | `ensureAudio`, `tone`, the `beep*` SFX, and the generative music scheduler (`musicTick`, `scheduleStep`, `playMusicNote`) |
| Share card | `makeScoreCard`, `shareCard`, `copyCard`, `downloadCard` |
| Persistence | `prefs`, `bests`, `loadPrefs`, `savePrefs`, `saveBests` |
| Toggles | `toggleSound`, `toggleMusic`, `toggleCRT`, `toggleTilt`, `toggleShake`, `toggleColorblind`, `setAutopilot`/`toggleAutopilot` |

## Persistence

`localStorage` under the `vibesnake.*` keys: `vibesnake.prefs` (sound, music, crt, tilt, autopilot, shake, colorblind, theme), `vibesnake.bests` (best score per mode), and `vibesnake.mode` / `vibesnake.diff` (last selection). All reads/writes are wrapped in try/catch so private-mode or storage-disabled browsers degrade gracefully.

## Adaptive board

`resize()` chooses the grid from the viewport. Between games it recomputes `COLS`/`ROWS` (forced odd so there is a true centre cell) from available width/height and a target cell size; during a game it keeps the grid fixed and only rescales `cell` to fit, so resizing mid-run never breaks the snake. `boardW`/`boardH` are the CSS pixel dimensions; the canvas backing store is multiplied by `dpr`.

## Design decisions worth knowing

- **Fixed-step logic + interpolated render.** Smooth at any framerate; the AI and rules reason in whole cells.
- **Odd-by-odd boards.** Gives a centered start. Trade-off: an odd cell count means no perfect Hamiltonian cycle exists, which constrains the "unbeatable" AI option (see [ai.md](ai.md)).
- **Reduced motion.** `reduceMotion` (from `prefers-reduced-motion`) disables shake, tilt, and the death animation, and trims particle counts. CSS also stops the CRT flicker and ambient drift.
- **No strobing.** There is deliberately no full-screen flash; eat feedback is local (ripple, particles, head pulse) so rapid eating cannot create a photosensitivity hazard.
- **Accessibility toggles.** A colourblind palette (blue snake vs amber food) and independent shake/tilt/CRT toggles live in the Settings sheet; menus are focus-trapped dialogs with an aria-live game-over announcement.
