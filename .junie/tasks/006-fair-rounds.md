# Task 006: redesign rounds 3 and 5 so the "smoke on the turret" shortcut no longer works

Read `.junie/guidelines.md` first.

## Background

A watcher sees from a single point, so a cloud parked right next to it hides almost everything it can see.
Rounds with two or more watchers are immune (the other watcher still sees), but the one-watcher rounds can be
beaten 100% just by dropping smoke on the turret. Round 1 is the tutorial and may stay that way.
**Rounds 3 (`over-the-top`, "Off The Wall") and 5 (`angle-shot`, "Angle Shot") must be fixed.**

`tests/levels.test.ts` encodes the fairness rules and currently fails exactly these two checks:

```
round 3 (over-the-top) > cannot be beaten by parking smoke on a watcher (60% at most)
round 5 (angle-shot)   > cannot be beaten by parking smoke on a watcher (60% at most)
```

## What to do

Edit ONLY the `over-the-top` and `angle-shot` entries in `src/game/levels.ts` (blocks, thrower, watchers,
crossing, cloudRadius, seconds, brief). Do not change any other level, any rule, `src/core`, the tests, or other files.

Make all tests in `tests/levels.test.ts` pass, keeping every other rule it checks (perfect cover exists,
perfect power window >= 40, best direct throw < 60%). Good ways to do it, in order of preference:

1. Tuck the watcher into an alcove: surround it on three sides with building blocks so the canister cannot land
   near it, leaving an opening only towards the crossing so it can still see the lane.
2. Or add a second watcher that sees the crossing from a clearly different side, so no single cloud spot near one
   watcher can blind both.

Design constraints:

- Keep each round's identity: round 3 is about banking off the top wall; round 5 is about the slanted wall.
- All blocks stay inside the arena (x 50..1550, y 110..850) with at least 70 units of open floor between any block
  and the crossing lane, the thrower, and each watcher's line of sight to the crossing.
- The thrower stays at least 120 units from any wall. The crossing stays 220 to 340 units long.
- `brief` is one short plain sentence telling the player what is special about the round.

## Verify

1. `npm test` (all tests, including `tests/levels.test.ts`, must pass).
2. `npm run solve` and paste its full output for rounds 3 and 5 into your final report.
3. `npm run typecheck`.
