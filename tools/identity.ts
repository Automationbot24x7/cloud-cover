// Which wall does each perfect bank throw hit first? Checks that rounds 3 and 5 keep their identity (run: npx vite-node tools/identity.ts).
import { computeThrow } from '../src/core/throw';
import { computeCoverage } from '../src/core/vision';
import { crossingSamples } from '../src/game/levelcheck';
import { LEVELS, THROW, wallsOf } from '../src/game/levels';
for (const idx of [2, 4]) {
  const level = LEVELS[idx];
  const walls = wallsOf(level);
  const samples = crossingSamples(level);
  const firstWall: Record<string, number> = {};
  let perfect = 0;
  for (let deg = 0; deg < 360; deg += 0.5) {
    const r = (deg * Math.PI) / 180;
    const dir = { x: Math.cos(r), y: Math.sin(r) };
    for (let power = THROW.minRange; power <= 1900; power += 10) {
      const t = computeThrow(level.thrower, { x: level.thrower.x + dir.x * power, y: level.thrower.y + dir.y * power }, walls, THROW);
      if (Math.abs(t.length - power) > 1 && t.bounces < THROW.maxBounces) break;
      const ratio = computeCoverage(level.watchers, samples, walls, [{ center: t.landing, radius: level.cloudRadius }]).ratio;
      if (ratio < 0.97 || t.bounces === 0) continue;
      perfect++;
      const b = t.path[1];
      const key = b.y < 135 ? 'top wall' : b.y > 825 ? 'bottom wall' : b.x < 75 ? 'left wall' : b.x > 1525 ? 'right wall' : 'a block (incl. slant)';
      firstWall[key] = (firstWall[key] ?? 0) + 1;
      const sk = 'ex:' + key;
      if (!(sk in firstWall) && Math.abs(power - 1000) < 900) firstWall[sk] = deg * 10000 + power;
    }
  }
  console.log(`round ${idx + 1} ${level.id}: ${perfect} perfect bank throws; first bounce off:`, firstWall);
}
