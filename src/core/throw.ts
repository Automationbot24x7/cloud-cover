import { Vec, Segment, ThrowOptions, ThrowResult } from './types';
import {
  add,
  sub,
  scale,
  normalize,
  distance,
  length,
  reflect,
  raycast,
  EPS,
} from './geom';

/** Default throw options. */
export const DEFAULT_THROW: ThrowOptions = {
  minRange: 60,
  maxRange: 1500,
  maxBounces: 3,
  bounceKeep: 1,
  skin: 10,
};

/**
 * Compute the canister throw path from origin toward target, bouncing off walls.
 * Returns the full path, landing point, bounce count, and total path length.
 */
export function computeThrow(
  origin: Vec,
  target: Vec,
  walls: Segment[],
  options: ThrowOptions
): ThrowResult {
  // 1. Direction
  let dir = normalize(sub(target, origin));
  if (length(dir) < EPS) {
    dir = { x: 1, y: 0 };
  }

  // 2. Total distance, clamped to [minRange, maxRange]
  let remaining = distance(origin, target);
  remaining = Math.max(options.minRange, Math.min(options.maxRange, remaining));

  const bouncePoints: Vec[] = [];
  let bounces = 0;
  let pos = { ...origin };

  // 3. Simulate the flight
  while (true) {
    const hit = raycast(pos, dir, remaining + options.skin, walls);

    if (!hit || hit.distance > remaining + options.skin + EPS) {
      // No hit — move remaining distance and land
      const landing = add(pos, scale(dir, remaining));
      if (
        bouncePoints.length > 0 &&
        distance(landing, bouncePoints[bouncePoints.length - 1]) < EPS
      ) {
        // Landing equals last bounce point — don't duplicate
        return {
          path: [origin, ...bouncePoints],
          landing: bouncePoints[bouncePoints.length - 1],
          bounces,
          length: pathLength([origin, ...bouncePoints]),
        };
      }
      return {
        path: [origin, ...bouncePoints, landing],
        landing,
        bounces,
        length: pathLength([origin, ...bouncePoints, landing]),
      };
    }

    // Hit found — move to just before the wall
    const moved = Math.max(0, hit.distance - options.skin);
    pos = add(pos, scale(dir, moved));
    bouncePoints.push({ ...pos });
    bounces += 1;

    // Update remaining distance
    remaining = (remaining - moved) * options.bounceKeep;

    // Reflect direction
    dir = reflect(dir, hit.normal);

    // Check max bounces
    if (bounces >= options.maxBounces) {
      // Current position is the landing
      if (
        bouncePoints.length > 0 &&
        distance(pos, bouncePoints[bouncePoints.length - 1]) < EPS
      ) {
        return {
          path: [origin, ...bouncePoints],
          landing: bouncePoints[bouncePoints.length - 1],
          bounces,
          length: pathLength([origin, ...bouncePoints]),
        };
      }
      return {
        path: [origin, ...bouncePoints, pos],
        landing: pos,
        bounces,
        length: pathLength([origin, ...bouncePoints, pos]),
      };
    }
  }
}

/** Compute the total length of a path. */
function pathLength(path: Vec[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += distance(path[i - 1], path[i]);
  }
  return total;
}
