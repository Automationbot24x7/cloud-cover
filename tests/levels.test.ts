import { describe, expect, it } from 'vitest';
import { analyzeLevel } from '../src/game/levelcheck';
import { LEVELS } from '../src/game/levels';

/**
 * Fairness rules every map in the pool must meet, checked by brute force over aim direction and power.
 * A coarse grid keeps the suite fast; `npm run solve` prints the full-precision report.
 *
 * - Solvable: a perfect cover (>= 97%) exists.
 * - Fair: the perfect power window is at least 40 world units wide.
 * - Tier 3 and up: a straight throw is not enough (best direct throw under 60%).
 * - Tier 2 and up: the "smoke on the turret" shortcut does not work (cloud within cloudRadius + 90 of a watcher: 60% at most).
 */
const reports = new Map(LEVELS.map((level) => [level.id, analyzeLevel(level, 1, 15)]));

describe('map pool', () => {
  it('has unique map ids', () => {
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
  });

  it('has at least three maps in every tier, so runs vary', () => {
    for (const tier of [1, 2, 3, 4, 5]) {
      expect(LEVELS.filter((l) => l.tier === tier).length, `tier ${tier}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe.each(LEVELS.map((level) => [level.id, level.tier] as const))('map %s (tier %i)', (id, tier) => {
  const r = reports.get(id)!; // every pool map was analysed above

  it('has a perfect cover', () => {
    expect(r.best).toBeGreaterThanOrEqual(0.97);
  });

  it('has a fair power window for the perfect cover', () => {
    expect(r.perfectWindow).toBeGreaterThanOrEqual(40);
  });

  if (tier >= 3) {
    it('needs a bank shot (best direct throw under 60%)', () => {
      expect(r.bestDirect).toBeLessThan(0.6);
    });
  }

  if (tier >= 2) {
    it('cannot be beaten by parking smoke on a watcher (60% at most)', () => {
      expect(r.bestNearWatcher).toBeLessThanOrEqual(0.6);
    });
  }
});
