import { Vec, Segment, Cloud, SightLine, SightState, Coverage } from './types';
import {
  sub,
  normalize,
  distance,
  length,
  cross,
  lerp,
  EPS,
  segmentCircleEntry,
} from './geom';

/**
 * Return count evenly spaced points from a to b, both ends included.
 * count below 2 is treated as 2.
 */
export function sampleSegment(a: Vec, b: Vec, count: number): Vec[] {
  const n = Math.max(2, count);
  const points: Vec[] = [];
  for (let i = 0; i < n; i++) {
    points.push(lerp(a, b, i / (n - 1)));
  }
  return points;
}

/**
 * Compute a sight line from `from` to `to`, checking walls and clouds.
 * Returns the state ('wall', 'cloud', 'open') and the nearest obstruction point.
 */
export function sightLine(
  from: Vec,
  to: Vec,
  walls: Segment[],
  clouds: Cloud[]
): SightLine {
  const dir = normalize(sub(to, from));
  const dist = distance(from, to);

  if (dist < EPS) {
    return { from, to, state: 'open', end: to };
  }

  // Check wall intersections
  let nearestWallDist = Infinity;
  for (const wall of walls) {
    const hitDist = segmentIntersectionDist(from, dir, dist, wall);
    if (hitDist !== null && hitDist < nearestWallDist) {
      nearestWallDist = hitDist;
    }
  }
  const hasWall = nearestWallDist < Infinity;

  // Check cloud intersections
  let nearestCloudDist = Infinity;
  for (const cloud of clouds) {
    const entry = segmentCircleEntry(from, to, cloud.center, cloud.radius);
    if (entry) {
      const d = distance(from, entry);
      if (d < nearestCloudDist) {
        nearestCloudDist = d;
      }
    }
  }
  const hasCloud = nearestCloudDist < Infinity;

  // Determine state
  let state: SightState;
  let end: Vec;

  if (hasWall) {
    state = 'wall';
    // End is the nearest obstruction (wall or cloud, whichever is closer)
    if (hasCloud && nearestCloudDist < nearestWallDist - EPS) {
      // Cloud is in front of wall — end is cloud entry
      end = nearestCloudPoint(from, to, clouds);
    } else {
      end = to;
    }
  } else if (hasCloud) {
    state = 'cloud';
    end = nearestCloudPoint(from, to, clouds);
  } else {
    state = 'open';
    end = to;
  }

  return { from, to, state, end };
}

/**
 * Find the nearest cloud entry point along the segment from->to.
 */
function nearestCloudPoint(
  from: Vec,
  to: Vec,
  clouds: Cloud[]
): Vec {
  let best: Vec | null = null;
  let bestDist = Infinity;

  for (const cloud of clouds) {
    const entry = segmentCircleEntry(from, to, cloud.center, cloud.radius);
    if (entry) {
      const d = distance(from, entry);
      if (d < bestDist) {
        bestDist = d;
        best = entry;
      }
    }
  }

  return best || to;
}

/**
 * Check if a ray from `origin` along `dir` intersects a segment within `maxDist`.
 * Returns the distance to the intersection point, or null if no intersection.
 */
function segmentIntersectionDist(
  origin: Vec,
  dir: Vec,
  maxDist: number,
  wall: Segment
): number | null {
  const segDir = sub(wall.b, wall.a);
  const segLen = length(segDir);
  if (segLen < EPS) return null;

  const denom = cross(dir, segDir);
  if (Math.abs(denom) < EPS) return null;

  const toWall = sub(wall.a, origin);
  const t = cross(toWall, segDir) / denom;
  const u = cross(toWall, dir) / denom;

  if (t < EPS || t > maxDist + EPS) return null;
  if (u < -EPS || u > segLen + EPS) return null;

  return t;
}

/**
 * Compute coverage for all watcher-sample pairs.
 * Returns sight lines, counts per state, and the coverage ratio.
 */
export function computeCoverage(
  watchers: Vec[],
  samples: Vec[],
  walls: Segment[],
  clouds: Cloud[]
): Coverage {
  const lines: SightLine[] = [];
  let wall = 0;
  let cloud = 0;
  let open = 0;

  for (const watcher of watchers) {
    for (const sample of samples) {
      const line = sightLine(watcher, sample, walls, clouds);
      lines.push(line);
      if (line.state === 'wall') wall++;
      else if (line.state === 'cloud') cloud++;
      else open++;
    }
  }

  const dangerous = cloud + open;
  const ratio = dangerous === 0 ? 1 : cloud / dangerous;

  return { lines, wall, cloud, open, ratio };
}
