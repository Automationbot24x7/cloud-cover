# Task 001: simulation core (geometry, throw path, sight coverage)

Read `.junie/guidelines.md` and `src/core/types.ts` first. Do not change `types.ts`.
Create exactly these files and nothing else:

- `src/core/geom.ts`
- `src/core/throw.ts`
- `src/core/vision.ts`
- `tests/geom.test.ts`
- `tests/throw.test.ts`
- `tests/vision.test.ts`

## src/core/geom.ts

Export `EPS = 1e-6` and these pure functions (all take and return plain `Vec` objects):

- `vec(x, y)`, `add(a, b)`, `sub(a, b)`, `scale(a, k)`, `dot(a, b)`, `cross(a, b)` (z of the 2D cross product),
  `length(a)`, `distance(a, b)`, `lerp(a, b, t)`.
- `normalize(a)`: unit vector; returns `{x: 0, y: 0}` when the length is below `EPS`.
- `reflect(dir, normal)`: mirror `dir` about a unit `normal`: `dir - 2 * dot(dir, normal) * normal`.
- `polygonToSegments(points: Vec[]): Segment[]`: the closed outline of a polygon, last point joined to the first.
- `raycast(origin: Vec, dir: Vec, maxDistance: number, walls: Segment[]): RayHit | null`:
  `dir` is a unit vector. Returns the nearest wall hit with `EPS < distance <= maxDistance`, or `null`.
  `normal` is the wall's unit normal on the side the ray came from (so `dot(dir, normal) < 0`).
  A ray parallel to a wall never hits it.
- `segmentCircleEntry(a: Vec, b: Vec, center: Vec, radius: number): Vec | null`:
  the first point, walking from `a` to `b`, that lies on or inside the circle.
  Returns `a` itself if `a` is already inside. Returns `null` if the segment never touches the circle.

## src/core/throw.ts

`computeThrow(origin: Vec, target: Vec, walls: Segment[], options: ThrowOptions): ThrowResult`

The canister flies in a straight line from `origin` towards `target` and bounces off walls like a billiard ball.

1. Direction is `normalize(target - origin)`. If `target` equals `origin`, use `{x: 1, y: 0}`.
2. The distance to travel is `distance(origin, target)` clamped to `[minRange, maxRange]`.
3. Repeat: raycast from the current position along the direction for `remaining + skin`.
   - No hit closer than `remaining + skin`: move `remaining` along the direction. That point is the landing. Stop.
   - Hit: move `max(0, hit.distance - skin)` so the centre stops `skin` short of the wall. Record that point as a
     bounce point. `bounces += 1`. `remaining = (remaining - moved) * bounceKeep`. Reflect the direction about
     `hit.normal`. If `bounces >= maxBounces`, the current position is the landing: stop.
4. `path` is `[origin, ...bouncePoints, landing]`. If the landing equals the last bounce point (stopped by `maxBounces`),
   do not add it twice. `length` is the summed length of `path`.

Also export `DEFAULT_THROW: ThrowOptions = { minRange: 60, maxRange: 1500, maxBounces: 3, bounceKeep: 1, skin: 10 }`.

## src/core/vision.ts

- `sampleSegment(a: Vec, b: Vec, count: number): Vec[]`: `count` evenly spaced points from `a` to `b`,
  both ends included. `count` below 2 is treated as 2.
- `sightLine(from: Vec, to: Vec, walls: Segment[], clouds: Cloud[]): SightLine`:
  - state is `'wall'` if any wall crosses the straight line from `from` to `to` (even if a cloud is nearer);
  - otherwise `'cloud'` if any cloud touches the line;
  - otherwise `'open'`.
  - `end` is the nearest obstruction point along the line (wall hit or cloud entry, whichever comes first),
    or `to` when the line is open.
- `computeCoverage(watchers: Vec[], samples: Vec[], walls: Segment[], clouds: Cloud[]): Coverage`:
  one sight line for every watcher and sample pair; counts per state; `ratio = cloud / (cloud + open)`,
  and `ratio = 1` when `cloud + open` is 0.

## Tests (Vitest)

Cover at least:

- geom: `normalize` of a zero vector; `reflect` off a horizontal and a 45 degree normal; `raycast` picks the nearest of
  two walls, misses a wall behind the origin, ignores a parallel wall, respects `maxDistance`, and returns a normal
  facing the origin from both sides of the same wall; `segmentCircleEntry` for miss, graze, pass-through and start-inside.
- throw: a free throw lands exactly at the target; range is clamped at both ends; one bounce off a vertical wall
  mirrors the x direction and the total path length equals the clamped range (minus nothing, since `bounceKeep` is 1);
  a throw into a corner terminates and never has more than `maxBounces` bounces; `bounceKeep = 0.5` shortens the leg
  after the bounce; the landing point is never closer than `skin - EPS` to the wall it bounced from in the simple case.
- vision: `sampleSegment` endpoints and count; an open line; a line blocked by a wall; a line blocked by a cloud;
  a line with a cloud in front of a wall is still `'wall'` and its `end` is the cloud entry point;
  `computeCoverage` ratio for a mixed case and for the "nothing dangerous" case.

Finish by running `npm run typecheck` and `npm test` and fixing anything that fails.
