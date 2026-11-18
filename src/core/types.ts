/**
 * Shared data shapes for the simulation core.
 *
 * The core (src/core) is pure: no DOM, no canvas, no timers, no randomness.
 * Everything is measured in "world units" on a 1600 x 900 play field,
 * x to the right and y down.
 */

export interface Vec {
  x: number;
  y: number;
}

/** A solid wall edge. Throws bounce off it and it blocks sight. */
export interface Segment {
  a: Vec;
  b: Vec;
}

/** Result of casting a ray against the walls. */
export interface RayHit {
  /** Where the ray met the wall. */
  point: Vec;
  /** Distance from the ray origin to `point`. */
  distance: number;
  /** Unit normal of the wall, facing back towards the ray origin. */
  normal: Vec;
  /** The wall that was hit. */
  wall: Segment;
}

export interface ThrowOptions {
  /** Shortest allowed throw, in world units. */
  minRange: number;
  /** Longest allowed throw, in world units (total path length, bounces included). */
  maxRange: number;
  /** After this many bounces the canister stops where it is. */
  maxBounces: number;
  /** Fraction of the remaining distance kept after each bounce (1 = no loss). */
  bounceKeep: number;
  /** Radius of the canister, so it rests clear of the wall instead of inside it. */
  skin: number;
}

export interface ThrowResult {
  /** Origin, every bounce point in order, then the landing point. Always at least 2 points. */
  path: Vec[];
  landing: Vec;
  bounces: number;
  /** Total length of `path`. */
  length: number;
}

/** A deployed smoke cloud. Blocks sight, does not block throws. */
export interface Cloud {
  center: Vec;
  radius: number;
}

export type SightState = 'wall' | 'cloud' | 'open';

/** One line of sight from a watcher to one sample point of the crossing. */
export interface SightLine {
  from: Vec;
  to: Vec;
  state: SightState;
  /** Where the line was stopped (wall or cloud edge). Equals `to` when open. */
  end: Vec;
}

export interface Coverage {
  lines: SightLine[];
  /** Lines stopped by a wall before any cloud: these never counted against the player. */
  wall: number;
  /** Lines that would be open but are stopped by a cloud. */
  cloud: number;
  /** Lines that still reach the crossing. */
  open: number;
  /**
   * cloud / (cloud + open), in 0..1. The share of the dangerous sight lines the player blocked.
   * 1 when there were no dangerous lines at all.
   */
  ratio: number;
}
