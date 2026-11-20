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
