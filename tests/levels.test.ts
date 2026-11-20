import { describe, expect, it } from 'vitest';
import { analyzeLevel } from '../src/game/levelcheck';
import { LEVELS } from '../src/game/levels';

/**
 * Fairness rules every round must meet, checked by brute force over aim direction and power.
 * A coarse grid keeps the suite fast; `npm run solve` prints the full-precision report.
 *
 * - Solvable: a perfect cover (>= 97%) exists.
 * - Fair: the perfect power window is at least 40 world units wide (about 0.04 s of charging).
 * - From round 3 on, a straight throw is not enough: the best direct throw covers under 60%.
 * - From round 2 on, the "smoke on the turret" shortcut does not work: a cloud parked within
 *   cloudRadius + 90 of a watcher covers at most 60%.
 */
const reports = LEVELS.map((level) => analyzeLevel(level, 1, 15));

describe.each(LEVELS.map((level, i) => [i + 1, level.id, i] as const))('round %i (%s)', (_round, _id, i) => {
  const r = reports[i];

  it('has a perfect cover', () => {
    expect(r.best).toBeGreaterThanOrEqual(0.97);
  });

  it('has a fair power window for the perfect cover', () => {
    expect(r.perfectWindow).toBeGreaterThanOrEqual(40);
  });

  if (i >= 2) {
    it('needs a bank shot (best direct throw under 60%)', () => {
      expect(r.bestDirect).toBeLessThan(0.6);
    });
  }

  if (i >= 1) {
    it('cannot be beaten by parking smoke on a watcher (60% at most)', () => {
      expect(r.bestNearWatcher).toBeLessThanOrEqual(0.6);
    });
  }
});
