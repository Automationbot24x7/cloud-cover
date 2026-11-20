import { computeThrow } from '../core/throw';
import type { Vec } from '../core/types';
import { computeCoverage, sampleSegment } from '../core/vision';
import { THROW, wallsOf, type Level } from './levels';

/** Points along the crossing that the watchers are tested against (same as the game uses). */
export const CHECK_SAMPLES = 24;
const INSET = 14;

/** The test points of a level's crossing, matching the game's own sampling. */
export function crossingSamples(level: Level): Vec[] {
  const { a, b } = level.crossing;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const k = INSET / len;
  return sampleSegment(
    { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k },
    { x: b.x - (b.x - a.x) * k, y: b.y - (b.y - a.y) * k },
    CHECK_SAMPLES,
  );
}

export interface LevelReport {
  id: string;
  /** Best cover (0..1) reachable with 0, 1 and 2+ bounces. */
  bestDirect: number;
  bestOneBank: number;
  bestMultiBank: number;
  best: number;
  /** Best cover from a cloud landing within `cloudRadius + 90` of any watcher: the "smoke on the turret" shortcut. */
  bestNearWatcher: number;
  /** Best cover from every other landing spot. */
  bestElsewhere: number;
  /** Widest run of throw power, in world units, that gives a perfect (>= 97%) cover in one aim direction. */
  perfectWindow: number;
  /** Example perfect throw: aim angle in degrees and power. */
  example: { deg: number; power: number; bounces: number } | null;
}

/**
 * Try every aim direction and throw power on a level and report what can be achieved.
 * `degStep` and `powerStep` trade speed for precision (the tests use a coarse grid).
 */
export function analyzeLevel(level: Level, degStep = 0.5, powerStep = 10): LevelReport {
  const walls = wallsOf(level);
  const samples = crossingSamples(level);
  const near = level.cloudRadius + 90;
  const best = [0, 0, 0];
  let bestNear = 0;
  let bestFar = 0;
  let perfectWindow = 0;
  let example: LevelReport['example'] = null;

  for (let deg = 0; deg < 360; deg += degStep) {
    const rad = (deg * Math.PI) / 180;
    const dir = { x: Math.cos(rad), y: Math.sin(rad) };
    const far = { x: level.thrower.x + dir.x * THROW.maxRange, y: level.thrower.y + dir.y * THROW.maxRange };
    const reach = computeThrow(level.thrower, far, walls, THROW).length;
    let run = 0;
    for (let power = THROW.minRange; power <= reach; power += powerStep) {
      const target = { x: level.thrower.x + dir.x * power, y: level.thrower.y + dir.y * power };
      const thrown = computeThrow(level.thrower, target, walls, THROW);
      const ratio = computeCoverage(level.watchers, samples, walls, [
        { center: thrown.landing, radius: level.cloudRadius },
      ]).ratio;
      const slot = Math.min(2, thrown.bounces);
      best[slot] = Math.max(best[slot], ratio);
      const isNear = level.watchers.some((w) => Math.hypot(w.x - thrown.landing.x, w.y - thrown.landing.y) < near);
      if (isNear) bestNear = Math.max(bestNear, ratio);
      else bestFar = Math.max(bestFar, ratio);
      if (ratio >= 0.97) {
        run += powerStep;
        perfectWindow = Math.max(perfectWindow, run);
        if (!example) example = { deg, power, bounces: thrown.bounces };
      } else {
        run = 0;
      }
    }
  }
  return {
    id: level.id,
    bestDirect: best[0],
    bestOneBank: best[1],
    bestMultiBank: best[2],
    best: Math.max(...best),
    bestNearWatcher: bestNear,
    bestElsewhere: bestFar,
    perfectWindow,
    example,
  };
}
