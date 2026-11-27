import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/game/levels';
import { buildRun, dayKey, hashString, mapOfTheDay, RUN_TIERS, seededRandom } from '../src/game/run';

describe('run builder', () => {
  it('builds six maps with no repeats, ending on the Map of the Day', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const run = buildRun(LEVELS, seededRandom(seed), '2026-12-05');
      expect(run.length).toBe(RUN_TIERS.length);
      expect(new Set(run.map((l) => l.id)).size).toBe(run.length);
      expect(run[run.length - 1].id).toBe(mapOfTheDay(LEVELS, '2026-12-05').id);
    }
  });

  it('never gets easier from one round to the next by more than one tier', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const run = buildRun(LEVELS, seededRandom(seed), '2026-12-05');
      for (let i = 1; i < run.length; i++) expect(run[i].tier).toBeGreaterThanOrEqual(run[i - 1].tier - 1);
    }
  });

  it('gives everyone the same final map on the same day', () => {
    expect(mapOfTheDay(LEVELS, '2026-12-05').id).toBe(mapOfTheDay(LEVELS, '2026-12-05').id);
    expect(mapOfTheDay(LEVELS, '2026-12-05').tier).toBe(5);
  });

  it('formats the day key in local time', () => {
    expect(dayKey(new Date(2026, 11, 5, 23, 59).getTime())).toBe('2026-12-05');
  });

  it('hashes strings stably', () => {
    expect(hashString('2026-12-05')).toBe(hashString('2026-12-05'));
    expect(hashString('2026-12-05')).not.toBe(hashString('2026-12-06'));
  });
});

describe('par', () => {
  it('is the sharp-run score: 900 per map plus bank bonuses from tier 3', async () => {
    const { parFor } = await import('../src/game/run');
    const { LEVELS } = await import('../src/game/levels');
    // Every tier has at least three maps (map pool test), so find always succeeds here.
    const byTier = (t: number) => LEVELS.find((l) => l.tier === t)!;
    // Tiers 1, 2, 3, 3, 4, 5: six maps at 900, banks 0+0+75+75+75+150.
    const run = [byTier(1), byTier(2), byTier(3), byTier(3), byTier(4), byTier(5)];
    expect(parFor(run)).toBe(6 * 900 + 375);
  });

  it("today's run is the same six maps every time for a date", async () => {
    const { todaysRun } = await import('../src/game/run');
    const { LEVELS } = await import('../src/game/levels');
    const a = todaysRun(LEVELS, '2027-01-05').map((l) => l.id);
    const b = todaysRun(LEVELS, '2027-01-05').map((l) => l.id);
    expect(a).toEqual(b);
    expect(a).toHaveLength(6);
  });
});
