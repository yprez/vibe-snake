# Autopilot AI

One algorithm (`aiNextDir`) drives two things: the in-game **autopilot** (toggle with `I` or the robot button) and the **attract-mode** snake that plays behind the start menu (`demoTick`). It returns the next direction each tick.

## The algorithm

Per step, in order:

1. **Target search.** Candidate targets are the food and, if present, the bonus gem. For each, run a breadth-first search (`aiPath`) for the shortest route over free cells. Blocked = the snake body (minus the tail tip while it is free) plus obstacles; `aiNeighbors` handles wrap adjacency.
2. **Tail-safety check.** Before committing to a target, virtually walk the path (`aiSimulate`), growing the snake by that target's growth amount, then check that the new head can still reach its new tail (`aiSafe`, another BFS). Only safe targets are eligible; among those, the shortest path wins. This is what stops the snake sealing itself into a pocket.
3. **Tail-chase fallback.** If no target is safe (or reachable), path toward the snake's own tail and step that way. Following the tail stalls safely until a real opening appears.
4. **Survival fallback.** If even the tail is unreachable, move to the neighbour whose flood-fill (`aiFlood`) opens the most space.

`aiStepDir` converts the chosen next cell into a unit direction, accounting for wrap.

## Mode and growth awareness

- **Wrap / maze:** neighbours and blocking come from `aiNeighbors` + `aiBlocked`, which respect `MODES[currentMode].wrap` and the `obstacles` set, so the same AI works in every mode.
- **Multiplier growth:** because bonus gems multiply length, `aiSimulate` keeps the tail in place for the last `growN` steps of a path (food `growN = FOOD_GROW`; a bonus uses `bonusGrow`). That makes the safety check conservative about grabbing a ×2 gem it could not survive.
- **Pending growth:** while a growth burst is queued (`pendingGrow > 0`) the tail is frozen, so `aiNextDir` blocks the tail cell instead of assuming it vacates.

## Measured behaviour

`tools/ai-sim.mjs` measures this: it extracts these functions and plays many full games headlessly. Across the benchmark's tight classic and maze boards the autopilot survives every game to the step cap (zero deaths), growing to roughly half the board on average and up to about three-quarters at its best. It does not try to fill the board: once long it spends most of its time tail-chasing and only eats when a provably safe path exists. Run the tool to reproduce, or pass more games and a higher tick cap for a wider sweep.

Net: great for an autopilot you watch or hand off to (it will not embarrass itself), not a board-filler.

## Why not A\*

A\* only helps on weighted graphs or very large search spaces. The board is an unweighted grid, so plain BFS already returns the shortest path; A\* would compute the identical route with extra bookkeeping and a heuristic that buys nothing here.

## Why not a Hamiltonian cycle (yet)

A **Hamiltonian cycle** (a fixed loop visiting every cell once) is the way to truly "solve" Snake: follow it and the snake can never die and fills 100 percent of the board. The pragmatic upgrade is a **perturbed Hamiltonian cycle**: follow the loop but take shortcuts toward the apple whenever they provably do not overtake the tail in cycle order, which keeps the guarantee while playing fast.

It is not used here because:

- The board size is **not fixed**: `COLS`/`ROWS` follow the viewport and the board-size setting, so the grid changes between sessions and on resize. A cycle would have to be rebuilt for each size, and a Hamiltonian cycle needs an even cell count, which an arbitrary board does not guarantee.
- **Wrap** and **maze obstacles** break the clean construction.

A future "perfect mode" could pin an even, fixed board and run a perturbed Hamiltonian cycle for classic play, keeping the BFS AI for wrap and maze.

## Where to tune

- The flood-fill cap in `aiFlood` bounds survival-search cost.
- To make the AI greedier (fills more, dies more), relax the `aiSafe` gate (for example only require the tail to be reachable for food, not bonuses).
- To make the in-game autopilot ignore power-ups, drop the bonus from the `targets` list in `aiNextDir`.
- After any change, re-run `tools/ai-sim.mjs` to confirm the autopilot still survives (the benchmark exits non-zero if its death rate climbs).
