# Task 002: fixes from code review of task 001

A review of `src/core` found three problems. Fix them and add regression tests. Only touch
`src/core/geom.ts`, `src/core/vision.ts`, `tests/geom.test.ts` and `tests/vision.test.ts`.

## 1. Rays hit walls beyond their end (bug)

In `raySegment` (geom.ts) and `segmentIntersectionDist` (vision.ts) the segment parameter is computed as
`u = cross(toWall, dir) / denom` with an un-normalised `segDir`. That makes `u` a fraction in `0..1`, but the
code accepts `u <= segLen + EPS`, so a 200-unit wall behaves as if it were 200 times longer.
Accept only `-EPS <= u <= 1 + EPS`.

Regression tests to add in `tests/geom.test.ts`:
- wall from (100, 0) to (100, 50); ray from (0, 80) along +x must MISS (it passes below the wall's end);
- same wall; ray from (0, 25) along +x must HIT at (100, 25);
- wall from (0, 100) to (300, 100); ray from (400, 0) along +y must MISS.

## 2. Duplicate intersection code

vision.ts re-implements the ray/segment test. Delete `segmentIntersectionDist` and call `raycast` from geom.ts
instead (cast from `from` along the unit direction with `maxDistance = distance(from, to) - EPS`, so a sample point
that sits exactly on a wall is not counted as hidden by that wall).

## 3. `SightLine.end` is wrong for wall lines

The spec says `end` is the nearest obstruction point. Today a line stopped by a wall returns `end = to`.
Return the wall hit point when the wall comes first, and the cloud entry point when a cloud comes first.

Regression tests to add in `tests/vision.test.ts`:
- a line blocked by a wall has `end` on the wall, not at `to`;
- a short wall that the line passes beside does NOT block it (state `'open'`);
- a sample point lying exactly on a wall, seen from the open side, is `'open'`.

Finish by running `npm run typecheck` and `npm test`.
