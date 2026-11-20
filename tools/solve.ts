/**
 * Level report: tries every aim direction (0.5 degree steps) and power (10 unit steps) on each round
 * and prints what can be achieved. The same check, on a coarser grid, runs in tests/levels.test.ts.
 * Run with: npm run solve
 */
import { analyzeLevel } from '../src/game/levelcheck';
import { LEVELS } from '../src/game/levels';

const pct = (v: number): string => `${Math.round(v * 100)}%`.padStart(4);

LEVELS.forEach((level, i) => {
  const r = analyzeLevel(level);
  console.log(
    `${String(i + 1).padStart(2)} t${level.tier} ${level.id.padEnd(16)} best ${pct(r.best)} | direct ${pct(r.bestDirect)}  1-bank ${pct(r.bestOneBank)}  2+bank ${pct(r.bestMultiBank)}` +
      ` | smoke on turret ${pct(r.bestNearWatcher)}, elsewhere ${pct(r.bestElsewhere)} | perfect window ${r.perfectWindow}u`,
  );
  if (r.example) console.log(`   e.g. aim ${r.example.deg} deg, power ${r.example.power}, ${r.example.bounces} bounce(s)`);
});
