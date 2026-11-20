# Task 007: grow the map pool to at least three maps per tier

Read `.junie/guidelines.md` first.

## Background

A run now draws six maps from the pool by difficulty tier (`src/game/run.ts`): tiers 1, 2, 3, 3, 4, then the
**Map of the Day** (a tier-5 map chosen by the date, the same for every player that day). With only six maps,
every run is the same, so repeat players just memorise the answers. The pool needs more maps.

`tests/levels.test.ts` currently fails one test: `map pool > has at least three maps in every tier`.

## What to do

Add new maps to the `LEVELS` array in `src/game/levels.ts` so that every tier has at least three maps. Aim for
**twelve new maps**: 2 in tier 1, 2 in tier 2, 2 in tier 3, 3 in tier 4, 3 in tier 5. Do not change the six
existing maps, the rules, `src/core`, the tests or any other file.

Every new map must pass every test in `tests/levels.test.ts`:

- a perfect cover exists, with a perfect power window of at least 40;
- tier 3 and up: the best straight throw covers under 60% (a bank shot is needed);
- tier 2 and up: smoke parked near a watcher covers at most 60% (use two or more watchers seeing the crossing
  from clearly different sides, or tuck a single watcher where the canister cannot reach).

## Design rules

- **Each map has one clear idea** a player can read in two seconds, stated in its `brief` (one short plain
  sentence, no dashes) and its `title` (one or two words, original). Examples of ideas: a long diagonal crossing;
  a narrow corridor you must bank down; a slanted wall that redirects; two watchers in a pincer; a watcher high
  in an alcove; a crossing hidden behind a pillar; a double bank around a block.
- **Vary the layouts**: move the thrower to different sides and corners, mix vertical, horizontal and diagonal
  crossings, use triangles and other polygons as well as rectangles. No two maps should look alike.
- Names must be original: no names of maps, places or characters from any existing game.
- All blocks inside the arena (x 50..1550, y 110..850). Keep at least 70 units of open floor between any block
  and the crossing lane, the thrower, and each watcher's view of the crossing. Thrower at least 120 units from any
  wall. Crossing 200 to 360 units long. `cloudRadius` between 85 and 140. `seconds` 8 to 10.
  Tier 1 maps use `assist: 'full'`; tier 4 and 5 use `assist: 'first'`.
- Higher tiers should be clearly harder: a narrower perfect power window, more bounces needed, more watchers.

## Verify

1. `npm test`: all tests must pass.
2. `npm run solve`: paste the full output into your final report.
3. `npm run typecheck`.
