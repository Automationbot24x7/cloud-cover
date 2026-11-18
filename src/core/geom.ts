import { Vec, Segment, RayHit } from './types';

/** Epsilon for floating-point comparisons. */
export const EPS = 1e-6;

/** Create a new Vec. */
export function vec(x: number, y: number): Vec {
  return { x, y };
}

/** Return a + b. */
export function add(a: Vec, b: Vec): Vec {
  return { x: a.x + b.x, y: a.y + b.y };
}

/** Return a - b. */
export function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y };
}

/** Return a scaled by k. */
export function scale(a: Vec, k: number): Vec {
  return { x: a.x * k, y: a.y * k };
}

/** Return the dot product of a and b. */
export function dot(a: Vec, b: Vec): number {
  return a.x * b.x + a.y * b.y;
}

/** Return the z-component of the 2D cross product of a and b. */
export function cross(a: Vec, b: Vec): number {
  return a.x * b.y - a.y * b.x;
}

/** Return the length of a. */
export function length(a: Vec): number {
  return Math.sqrt(a.x * a.x + a.y * a.y);
}

/** Return the distance between a and b. */
export function distance(a: Vec, b: Vec): number {
  return length(sub(a, b));
}

/** Return the linear interpolation between a and b at t. */
export function lerp(a: Vec, b: Vec, t: number): Vec {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Return a unit vector in the direction of a; zero vector when |a| < EPS. */
export function normalize(a: Vec): Vec {
  const len = length(a);
  if (len < EPS) return { x: 0, y: 0 };
  return { x: a.x / len, y: a.y / len };
}

/** Reflect dir about a unit normal: dir - 2 * dot(dir, normal) * normal. */
export function reflect(dir: Vec, normal: Vec): Vec {
  const d = dot(dir, normal);
  return sub(dir, scale(normal, 2 * d));
}

/** Return the closed outline segments of a polygon. */
export function polygonToSegments(points: Vec[]): Segment[] {
  const segments: Segment[] = [];
  for (let i = 0; i < points.length; i++) {
    segments.push({ a: points[i], b: points[(i + 1) % points.length] });
  }
  return segments;
}

/**
 * Cast a ray from origin along unit dir against walls.
 * Returns the nearest hit with EPS < distance <= maxDistance, or null.
 */
export function raycast(
  origin: Vec,
  dir: Vec,
  maxDistance: number,
  walls: Segment[]
): RayHit | null {
  let best: RayHit | null = null;

  for (const wall of walls) {
    const hit = raySegment(origin, dir, maxDistance, wall);
    if (hit && (!best || hit.distance < best.distance)) {
      best = hit;
    }
  }

  return best;
}

/**
 * Test a single segment against the ray.
 * Returns a RayHit if the ray intersects the segment within range, null otherwise.
 */
function raySegment(
  origin: Vec,
  dir: Vec,
  maxDistance: number,
  wall: Segment
): RayHit | null {
  const segDir = sub(wall.b, wall.a);
  const segLen = length(segDir);
  if (segLen < EPS) return null; // degenerate segment

  // 2D cross product test — parallel rays never hit
  const denom = cross(dir, segDir);
  if (Math.abs(denom) < EPS) return null;

  const toWall = sub(wall.a, origin);
  const t = cross(toWall, segDir) / denom; // ray param
  const u = cross(toWall, dir) / denom;    // segment param (fraction 0..1)

  // Ray must go forward past epsilon
  if (t < EPS) return null;
  // Must be within maxDistance
  if (t > maxDistance) return null;
  // Intersection must be on the segment (inclusive of endpoints)
  // u is a fraction in [0, 1] because segDir is un-normalised in the cross product
  if (u < -EPS || u > 1 + EPS) return null;

  const point = add(origin, scale(dir, t));

  // Compute wall normal facing the ray origin
  const wallDir = normalize(segDir);
  // Two possible normals: perpendicular to wallDir
  const n1 = { x: -wallDir.y, y: wallDir.x };
  const n2 = { x: wallDir.y, y: -wallDir.x };

  // Pick the one that faces the origin (dot(fromPoint->origin, normal) > 0)
  const toOriginVec = sub(origin, point);
  const d1 = dot(toOriginVec, n1);
  const normal = d1 >= 0 ? n1 : n2;

  return { point, distance: t, normal, wall };
}

/**
 * Find the first point walking from a to b that lies on or inside the circle.
 * Returns a if a is already inside. Returns null if the segment never touches the circle.
 */
export function segmentCircleEntry(
  a: Vec,
  b: Vec,
  center: Vec,
  radius: number
): Vec | null {
  // Check if a is already inside
  if (distance(a, center) <= radius + EPS) {
    return a;
  }

  const dir = sub(b, a);
  const dirLen = length(dir);
  if (dirLen < EPS) return null; // a === b and a is outside

  // Parametric: p(t) = a + t * dir, t in [0, 1]
  // |p(t) - center|^2 = radius^2
  const oc = sub(a, center);
  const A = dot(dir, dir);
  const B = 2 * dot(oc, dir);
  const C = dot(oc, oc) - radius * radius;

  const disc = B * B - 4 * A * C;
  if (disc < -EPS) return null; // no intersection

  const sqrtDisc = Math.sqrt(Math.max(0, disc));
  const t1 = (-B - sqrtDisc) / (2 * A);
  const t2 = (-B + sqrtDisc) / (2 * A);

  // We want the smallest t in [0, 1]
  const candidates = [t1, t2].filter((t) => t >= -EPS && t <= 1 + EPS).sort((a, b) => a - b);

  if (candidates.length === 0) return null;

  const t = Math.max(0, Math.min(1, candidates[0]));
  return add(a, scale(dir, t));
}
