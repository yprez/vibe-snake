# Vibe Snake

A modern take on classic Snake, with power-ups, combos, themes, generative audio, and an autopilot AI.

**Play it:** **https://yprez.github.io/vibe-snake/**, or open `index.html` locally.

## Features

- **Adaptive full-screen board.** The playfield sizes itself to your viewport: a bigger, wider grid on large monitors, taller on phones. A Small/Medium/Large screen-size control scales the cells to taste. Grid dimensions lock when a game starts, so resizing mid-play rescales instead of breaking the run.
- **Buttery-smooth movement.** The snake interpolates between steps; the head pokes forward and the tail recedes, so turns render as clean rounded corners with no jitter.
- **Three game modes.** Classic (walls kill), Wrap (pass through edges), and Maze (interior obstacles).
- **Four difficulties.** Easy, Medium, Hard, Insane.
- **Combo system.** Chain quick eats to build a score multiplier up to ×6. The snake heats up into a rainbow glow as your combo climbs.
- **Power-up roster.** Special pickups spawn periodically with a countdown ring: bonus points, magnet (food homes toward you), slow-mo, phase (pass through your own tail), and trim (shed half your tail). Active effects show as live countdown chips.
- **Four themes.** Neon, Retro (mono-green LCD), Synth (synthwave), and Mono. Picked on the start screen; recolors the whole game and UI instantly.
- **Attract mode.** An AI snake auto-plays (BFS pathfinding) behind the start menu, so the game is alive the moment it loads.
- **Shareable score card.** Game over renders a themed PNG you can Share (Web Share API), Copy, or Save.
- **Visuals and game feel.** Neon glow, drifting starfield, particle bursts, floating score, grid ripples, screen shake, hit-stop on eat, a slow-mo desaturating death, a combo-reactive background aura, a subtle parallax board tilt, and an optional CRT scanline mode.
- **Generative audio.** Every sound is synthesized live with the Web Audio API, no audio files: reactive SFX plus an ambient, tempo-scaling music loop.
- **Plays everywhere.** Keyboard, on-screen D-pad, and swipe controls; fully responsive; high scores saved per mode via `localStorage`.

## Controls

| Action | Keys |
| --- | --- |
| Move | Arrow keys / `WASD` / swipe / D-pad |
| Start / Pause / Resume | `Space` or `Enter` |
| Pause | `P` or `Esc` |
| Autopilot (AI mode) | `I` (or steer to take over) |
| Toggle music | `M` |
| Toggle CRT effect | `C` |
| Toggle board tilt | `T` |

Mode, difficulty, screen size, and theme are chosen on the start screen.

## Documentation

Developer docs live in [`docs/`](docs/README.md): [architecture](docs/architecture.md) (how the code is organized), [gameplay and tuning](docs/gameplay.md) (rules and every knob), [the AI](docs/ai.md) (autopilot algorithm), and [contributing](docs/contributing.md) (dev workflow and how to add themes, power-ups, and modes).

## Run locally

Open `index.html` in a browser, or serve it:

```bash
open index.html        # macOS
xdg-open index.html    # Linux

python3 -m http.server 8000   # then visit http://localhost:8000
```

## Deploy

The site goes live on GitHub Pages through `.github/workflows/pages.yml`: push to `main` and it publishes the game and its assets. Internal files (`AGENTS.md`, `docs/`, `tools/`) are not served.

1. Push the repo to GitHub.
2. In **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**.
3. The next push to `main` publishes. The live URL appears in the workflow's deploy step, at `https://<you>.github.io/<repo>/`.

For a custom domain, add a `CNAME` file with the domain, then configure DNS as usual.

## Tech notes

- Rendered on a single `<canvas>` with `devicePixelRatio` scaling; a `requestAnimationFrame` loop with a fixed logic tick and frame-rate-independent interpolation.
- Audio is generated on the fly with oscillators and gain envelopes through the Web Audio API.

## License

GNU Affero General Public License v3.0, see [`LICENSE`](LICENSE). You can use, study, and modify it, but any copy you distribute or host (including a website or an app) must also be open-sourced under the AGPL.
