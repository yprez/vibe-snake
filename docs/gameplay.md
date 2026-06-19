# Gameplay and tuning

The design rules, and every constant you would reach for to tune them. Constants live at the top of the IIFE unless noted.

## Objective

Eat food to grow, chain eats for a score multiplier, grab power-up gems, and avoid crashing into a wall, an obstacle, or yourself. Filling the entire board is a win.

## Modes

`MODES` defines three:

| Mode | Behaviour |
|------|-----------|
| Classic | Walls kill. |
| Wrap | Edges wrap around; obstacles off. |
| Maze | Static obstacles on the board (symmetric blocks from `buildObstacles`); walls kill. |

Mode is chosen on the start screen. Best scores are tracked **per mode** (`bests`).

## Difficulty

`DIFFS` sets each tier's starting step interval and its speed floor (ms), both lower = faster: Easy 165/66, Medium 130/66, Hard 96/66, Insane 72/50. Insane is faster from the first move and keeps accelerating to a lower floor than the rest.

## Speed curve

`interval` begins at the difficulty base and decreases by `STEP_SPEEDUP` (3.5 ms) per apple eaten, clamped to that difficulty's floor (`DIFFS[currentDiff].min`). Slow-mo multiplies the effective interval by 1.9 while active. The generative music tempo also rises with apples eaten (`setMusicTempo`).

## Scoring and combo

- Apple: `10 × combo.mult` points.
- Bonus gems: points gem `60 × mult`; magnet/slow-mo/phase `25 × mult`; trim `15 × mult`.
- **Combo** (`combo`): each eat increments `count` and refreshes a timer (`combo.window`, 2.4 s). `mult = min(6, 1 + floor(count/2))`, so every two quick eats raises the multiplier, capped at ×6. Let the timer lapse and it resets to ×1. `comboGlow()` (0..1) drives the snake's rainbow/brightness and the background aura.

## Length growth (food and bonus multipliers)

Growth is queued through `pendingGrow` (see architecture.md). Per bite:

- **Apple** adds `FOOD_GROW` (1) segment.
- **Bonus gem** adds a **multiple of current length** via `bonusGrow(type, len)`, using `LEN_MULT`:

| Gem | Length effect | `LEN_MULT` |
|-----|---------------|-----------|
| Points (★) | ×2 (doubles); spawns only below 30% board fill | 2.0 |
| Magnet (🧲) | ×1.5 | 1.5 |
| Slow-mo (🐌) | ×1.5 | 1.5 |
| Phase (👻) | ×1.5 | 1.5 |
| Trim (✂) | ×0.5 (halves, min length 3) | n/a, handled by `doTrim` |

`bonusGrow` returns `ceil(len × (mult-1))` (floor 2), capped so a single gem never grows the snake past ~70% of the usable board, so no bonus can force unavoidable death. Trim is handled separately by `doTrim`.

## Power-up roster

A special gem spawns every `BONUS_EVERY` (5) apples, lives `BONUS_LIFE` (6 s) with a shrinking countdown ring, and is one weighted-random type (`choosePower`). Active timed effects show as countdown chips (`FX_KEYS`, `updateEffectsHUD`).

| Type | Effect | Duration |
|------|--------|----------|
| Points | Big points + ×2 length (gated by board fill) | instant |
| Magnet | Food drifts toward the head each tick (`magnetPull`) | 6 s |
| Slow-mo | Step interval ×1.9 | 5 s |
| Phase | Pass through your own tail (self-collision ignored) | 5 s |
| Trim | Halve your length for breathing room | instant |

Colours, glow, on-board glyph, and labels are in `POWERS`. Weights are in `choosePower`: while the snake fills under 30% of the board, points 40% then magnet/slow-mo/phase/trim; at or above 30% the ×2 Points gem stops spawning (doubling a long snake could outrun the free space) and is replaced by trim plus the utility gems.

## Winning and losing

- **Lose:** head enters a wall (non-wrap), an obstacle, or a body cell (unless phase is active). Triggers `beginEnd(false)`.
- **Win:** no empty cell remains for new food (`placeFood` fails), triggering `beginEnd(true)`.

## Controls

| Action | Input |
|--------|-------|
| Move | Arrow keys / `WASD` / swipe on the board / on-screen d-pad |
| Start, pause, resume | `Space` or `Enter` |
| Pause | `P` or `Esc` |
| Autopilot (AI) | `I` or the robot button; any steering input hands control back |
| Music | `M` |
| CRT effect | `C` |
| Board tilt | `T` |

Sound, music, CRT, board tilt, screen shake, and the colourblind palette live in the **Settings sheet** (gear button, also reachable from the pause menu), along with a **Reset to defaults**. Autopilot and Pause are their own header buttons. Mode, difficulty, and theme are on the start screen.

## Tuning cheat-sheet

| Want to change | Edit |
|----------------|------|
| Start length | `START_LEN` |
| Per-apple speed-up | `STEP_SPEEDUP` |
| Difficulty start speed / floor | `DIFFS[*].base` / `DIFFS[*].min` |
| How often gems appear / how long they last | `BONUS_EVERY`, `BONUS_LIFE` |
| Per-apple growth | `FOOD_GROW` |
| Bonus length multipliers | `LEN_MULT` (and `doTrim` for trim) |
| Gem type odds | `choosePower` |
| Combo window / cap | `combo.window`, the `min(6, ...)` cap in `addCombo` |
| Tilt strength | `MAX_TILT` |
| Particle ceiling | `MAX_PARTICLES` |
| Themes / colours | `THEMES` (see contributing.md) |
| Maze layout | `buildObstacles` |
