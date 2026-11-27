import type { Level, Tier } from './levels';

/** The difficulty of each of the six rounds in a run. The last round is the Map of the Day. */
export const RUN_TIERS: readonly Tier[] = [1, 2, 3, 3, 4, 5];

/**
 * Today's par: the score of a sharp run on these maps. Full cover on every map, thrown with half the timer left,
 * and one bank shot on maps from tier 3 (two on the Map of the Day tier), matching the points rules in game.ts.
 */
export function parFor(run: readonly Level[]): number {
  return run.reduce((sum, level) => sum + 800 + 100 + 75 * (level.tier >= 5 ? 2 : level.tier >= 3 ? 1 : 0), 0);
}

/** Today's date in local time as YYYY-MM-DD: the key for the Map of the Day. */
export function dayKey(now = Date.now()): string {
  const d = new Date(now);
  const pad = (v: number): string => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A stable 32-bit hash of a string (FNV-1a). */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** A small seeded random generator returning numbers in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The final map everyone plays on a given day: one of the hardest maps, picked by the date. */
export function mapOfTheDay(pool: readonly Level[], day: string): Level {
  const finals = pool.filter((l) => l.tier === 5);
  const choices = finals.length ? finals : pool.filter((l) => l.tier === 4);
  const list = choices.length ? choices : pool;
  return list[hashString(day) % list.length];
}

/**
 * Six maps for one run: rounds 1-5 drawn at random by tier (no repeats), round 6 the Map of the Day.
 * If a tier runs out of unused maps, the nearest tier is used instead.
 */
export function buildRun(pool: readonly Level[], rand: () => number, day: string): Level[] {
  const daily = mapOfTheDay(pool, day);
  const used = new Set<string>([daily.id]);
  const run: Level[] = [];
  for (const tier of RUN_TIERS.slice(0, -1)) {
    let pick: Level | undefined;
    for (let spread = 0; spread <= 4 && !pick; spread++) {
      const options = pool.filter((l) => !used.has(l.id) && Math.abs(l.tier - tier) === spread);
      if (options.length) pick = options[Math.floor(rand() * options.length)];
    }
    if (!pick) break;
    used.add(pick.id);
    run.push(pick);
  }
  run.push(daily);
  return run;
}

/** Today's six maps: the same for every player on this date. */
export function todaysRun(pool: readonly Level[], day: string): Level[] {
  return buildRun(pool, seededRandom(hashString(`run:${day}`)), day);
}
