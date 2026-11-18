# Cloud Cover: project guidelines

Cloud Cover is a 90-second mini game for an esports event booth. The player throws a smoke
canister that banks off walls and must land where its cloud blocks the watchers' view of a
crossing. It runs in the browser, offline, on a booth laptop.

## Layout

- `src/core/`: the simulation. Pure TypeScript, no DOM, no canvas, no timers, no `Math.random`.
  Everything here must be deterministic and covered by unit tests in `tests/`.
- `src/game/`: state machine, levels, input, rendering, audio, UI. May use the DOM.
- `tests/`: Vitest unit tests. One file per core module, named `<module>.test.ts`.
- World units: a 1600 x 900 field, x right, y down.

## Code style

- TypeScript strict mode. No `any`, no non-null `!` unless a comment explains why it is safe.
- Named exports only. No default exports. No classes in `src/core`; plain functions and data.
- Do not mutate arguments. Return new objects.
- Small functions with a one-line doc comment that says what it returns.
- No new dependencies without asking.
- Floating point: compare with an epsilon (`EPS = 1e-6`) and never divide by a length that can be 0.

## How to verify

- `npm run typecheck` must pass.
- `npm test` must pass.
- Do not edit files outside the ones a task names.
