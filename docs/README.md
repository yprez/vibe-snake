# Vibe Snake docs

Developer documentation for the game. The code is all in one file (`../index.html`): HTML, CSS, and JS in an IIFE. These docs are the map, so you can find the right part of that file by feature instead of scrolling.

## Where to look

| If you want to | Read |
|----------------|------|
| Understand how the file is structured (state machine, game loop, rendering, subsystems) | [architecture.md](architecture.md) |
| Know the rules and every tuning knob (modes, scoring, combos, power-ups, speed) | [gameplay.md](gameplay.md) |
| Understand the autopilot / attract-mode AI (algorithm, trade-offs, performance) | [ai.md](ai.md) |
| Work on the game (dev workflow, validation harness, how to add a theme/power-up/mode) | [contributing.md](contributing.md) |

## Ground rules for these docs

- **No line numbers.** Reference functions, objects, and CSS classes by name. Line numbers rot on the first edit.
- **Keep them honest.** When you change a mechanic or constant, update `gameplay.md`; when you change structure, update `architecture.md`.
- **The code is the source of truth.** These docs explain the shape and the "why", not every line.
