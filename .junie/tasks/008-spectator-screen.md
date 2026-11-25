# Task 008: live spectator screen on the second monitor

Read `.junie/guidelines.md` first.

## Background

At the booth, a second monitor faces the queue. Today it shows `board.html`: today's top 10 scores, updated
through a `BroadcastChannel` when a score is saved (`src/game/store.ts`, `src/board.ts`). Between saved scores
it is static, so the queue cannot see what the current player is doing. People in line should be able to follow
the run live: which map, where the smoke is going, how much is hidden, and how many of the squad made it.

Everything runs on one laptop with no network, so the game window and the board window talk through a
`BroadcastChannel`, like the scores already do.

## What to build

### 1. `src/game/live.ts` (new): the live feed

- A `BroadcastChannel` named `cloudcover-live`.
- Message types (a discriminated union `LiveMessage`):
  - `round`: `{ index, total, levelId }` when a round's intro starts.
  - `aim`: `{ marker: Vec, charging: boolean, ratio: number | null }` while aiming. `ratio` is the live share of
    sight lines hidden (`state.live?.ratio`), only while charging.
  - `cloud`: `{ center: Vec, radius: number }` when the cloud lands.
  - `result`: `{ ratio, grade, saved, points, score }` when a round is scored.
  - `summary`: `{ score, saved, squad }` at the end of the run.
  - `idle`: back on the title screen.
- `publishLive(message)`: posts a message. Wrap in try/catch (older browsers have no BroadcastChannel).
- `onLive(handler)`: subscribes; returns an unsubscribe function.
- A pure reducer `reduceLive(view: LiveView, message: LiveMessage): LiveView` that the board uses to keep its
  picture of the run, and `initialLiveView()` for the idle state. `LiveView` holds: status (`idle`, `aiming`,
  `flying`, `result`, `summary`), round index and total, level id, marker, charging, ratio, cloud, last result,
  total score, saved so far, and `at` (time of the last message, passed in by the caller, not read from a clock).
- Unit tests in `tests/live.test.ts` for the reducer: a full run of messages gives the expected view; a new
  `round` clears the previous cloud and result; `idle` resets everything.

### 2. `src/main.ts`: publish from the game

- Use the existing `createGame` hooks for `round`, `result`, `summary`, and `resetToAttract` / the HUD's reset
  for `idle`.
- `aim` messages: from the frame loop while `state.phase === 'aim'`, at most 10 per second.
- `cloud`: once, when `state.cloud` first appears in a round.
- Publishing must never throw and must not slow the frame loop.

### 3. `src/game/spectator.ts` (new): draw the live map

- `drawSpectator(ctx, level, view, clock)`: a clean top-down 2D picture of the current map in the same style as
  the game's flat renderer (`src/game/render.ts`, reuse its colours): arena, blocks, the crossing lane, the
  thrower, each watcher with a soft red view fan towards the crossing (reuse `visibilityFan` logic from
  `src/game/render3d.ts` or the vision helpers in `src/core`), the landing ring while charging, and the cloud
  once it lands.
- Look the level up by id in `LEVELS` (`src/game/levels.ts`). Unknown id: draw nothing.

### 4. `board.html`, `src/board.ts`, `src/board.css`: the new board layout

- 1600 x 900 stage (same `--u` scaling as now). Left two thirds: **NOW PLAYING** panel with the live map canvas,
  above it the round (`ROUND 3 OF 6` and the map title; the last round says `MAP OF THE DAY`), and a big live
  `% HIDDEN` number while the player charges (colour by grade like the game: coral, amber, cyan, mint).
  After a round: the grade word, `N/5 SAFE`, and points. Total score in the panel corner.
- Right third: **TODAY'S BEST**, the existing top 10 list (keep `renderBoardRows`), smaller than now.
- When no live message has arrived for 20 seconds, or after `idle`: the left panel shows an attract card:
  `NEXT UP: YOU`, and today's Map of the Day title (`mapOfTheDay(LEVELS, dayKey())` from `src/game/run.ts`).
- Redraw the canvas with `requestAnimationFrame` only while live; idle costs nothing.
- The board must still work alone (opened before the game, or the game closed).

## Rules

- Files you may create or edit: `src/game/live.ts`, `src/game/spectator.ts`, `tests/live.test.ts`,
  `src/main.ts`, `src/board.ts`, `src/board.css`, `board.html`. Nothing else.
- No new dependencies. No network. No `Math.random` in `live.ts`.
- Text on screen: plain words, no dashes, no brand or game names other than Cloud Cover.
- `npm run typecheck` and `npm test` must pass. Then run `npm run build`.

## Done when

- Opening `board.html` in a second window while playing `index.html` shows the run live, round by round.
- Closing the game window returns the board to the attract card within 20 seconds.
- Typecheck, tests and build pass.
