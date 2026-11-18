/**
 * Level checker. For every level it tries a grid of aim points and reports how good the
 * best throw is with 0, 1 and 2+ bounces, and how much of the field gives a good result.
 * Run with: npx vite-node tools/solve.ts
 */
import { computeThrow } from '../src/core/throw';
import { computeCoverage, sampleSegment } from '../src/core/vision';
import { LEVELS, THROW, wallsOf } from '../src/game/levels';

const STEP = 10;
const SAMPLES = 24;
const INSET = 14;

for (const level of LEVELS) {
  const walls = wallsOf(level);
  const { a, b } = level.crossing;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const k = INSET / len;
  const samples = sampleSegment(
    { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k },
    { x: b.x - (b.x - a.x) * k, y: b.y - (b.y - a.y) * k },
    SAMPLES,
  );
  const base = computeCoverage(level.watchers, samples, walls, []);
  const best = [0, 0, 0];
  const bestAt: string[] = ['', '', ''];
  const window = [0, 0, 0];
  let total = 0;
  let good = 0;
  let perfect = 0;
  for (let deg = 0; deg < 360; deg += 0.5) {
    const rad = (deg * Math.PI) / 180;
    const dir = { x: Math.cos(rad), y: Math.sin(rad) };
    const far = { x: level.thrower.x + dir.x * THROW.maxRange, y: level.thrower.y + dir.y * THROW.maxRange };
    const reach = computeThrow(level.thrower, far, walls, THROW).length;
    const run = [0, 0, 0];
    for (let range = THROW.minRange; range <= reach; range += STEP) {
      const target = { x: level.thrower.x + dir.x * range, y: level.thrower.y + dir.y * range };
      const thrown = computeThrow(level.thrower, target, walls, THROW);
      const cov = computeCoverage(level.watchers, samples, walls, [{ center: thrown.landing, radius: level.cloudRadius }]);
      const slot = Math.min(2, thrown.bounces);
      if (cov.ratio > best[slot]) {
        best[slot] = cov.ratio;
        bestAt[slot] = `${deg} deg, power ${range}, lands (${Math.round(thrown.landing.x)},${Math.round(thrown.landing.y)})`;
      }
      for (let k = 0; k < 3; k++) {
        if (k === slot && cov.ratio >= 0.97) {
          run[k] += STEP;
          window[k] = Math.max(window[k], run[k]);
        } else {
          run[k] = 0;
        }
      }
      total++;
      if (cov.ratio >= 0.7) good++;
      if (cov.ratio >= 0.97) perfect++;
    }
  }
  const pct = (v: number): string => `${(v * 100).toFixed(0)}%`.padStart(4);
  console.log(
    `${level.id.padEnd(14)} open lines ${String(base.open).padStart(3)}/${base.lines.length}` +
      ` | best direct ${pct(best[0])}  1-bank ${pct(best[1])}  2+bank ${pct(best[2])}` +
      ` | of all throws: good ${pct(good / total)} perfect ${pct(perfect / total)}` +
      ` | widest perfect power window: direct ${window[0]}u, 1-bank ${window[1]}u, 2+bank ${window[2]}u`,
  );
  console.log(`   direct ${bestAt[0]}\n   1-bank ${bestAt[1]}\n   2+bank ${bestAt[2]}`);
}
