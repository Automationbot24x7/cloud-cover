import type { Vec } from '../core/types';
import { computeCoverage, sampleSegment } from '../core/vision';
import { COLOR } from './render';
import { ARENA, WORLD, wallsOf, type Level } from './levels';
import type { LiveView } from './live';

const MAP_SAMPLES = 24;
const FAN_CACHE = new Map<string, { samples: Vec[]; lines: ReturnType<typeof computeCoverage>['lines'] }>();

/** Draw a top-down spectator view of the current level and live run state. */
export function drawSpectator(ctx: CanvasRenderingContext2D, level: Level, view: LiveView, clock: number): void {
  ctx.clearRect(0, 0, WORLD.w, WORLD.h);
  drawBackdrop(ctx, clock);
  drawCrossing(ctx, level, clock);
  drawFans(ctx, level, clock);
  drawBlocks(ctx, level);
  drawThrower(ctx, level.thrower);
  drawWatchers(ctx, level.watchers, clock);
  drawSquad(ctx, level, view);
  if (view.cloud) drawCloud(ctx, view.cloud.center, view.cloud.radius, clock);
  if (view.status === 'aiming' && view.charging && view.marker) {
    drawMarker(ctx, view.marker, level.cloudRadius, clock);
  } else if (view.status === 'flying' && view.marker) {
    drawCanister(ctx, view.marker);
  }
}

function drawBackdrop(ctx: CanvasRenderingContext2D, clock: number): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, WORLD.h);
  gradient.addColorStop(0, COLOR.bgTop);
  gradient.addColorStop(1, COLOR.bgBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h, 8);
  ctx.clip();
  ctx.fillStyle = 'rgba(25, 167, 255, 0.035)';
  ctx.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
  ctx.strokeStyle = COLOR.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = ARENA.x; x <= ARENA.x + ARENA.w; x += 50) {
    ctx.moveTo(x, ARENA.y);
    ctx.lineTo(x, ARENA.y + ARENA.h);
  }
  for (let y = ARENA.y; y <= ARENA.y + ARENA.h; y += 50) {
    ctx.moveTo(ARENA.x, y);
    ctx.lineTo(ARENA.x + ARENA.w, y);
  }
  ctx.stroke();
  const glow = ctx.createRadialGradient(WORLD.w / 2, WORLD.h / 2, 30, WORLD.w / 2, WORLD.h / 2, 900);
  glow.addColorStop(0, `rgba(40, 110, 200, ${0.1 + 0.025 * Math.sin(clock)})`);
  glow.addColorStop(1, 'rgba(40, 110, 200, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
  ctx.restore();
  ctx.strokeStyle = COLOR.arenaEdge;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h, 8);
  ctx.stroke();
}

function drawCrossing(ctx: CanvasRenderingContext2D, level: Level, clock: number): void {
  const { a, b } = level.crossing;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.fillStyle = 'rgba(25, 167, 255, 0.10)';
  ctx.fillRect(0, -30, length, 60);
  ctx.strokeStyle = 'rgba(127, 224, 255, 0.48)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.lineTo(length, -30);
  ctx.moveTo(0, 30);
  ctx.lineTo(length, 30);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(127, 224, 255, 0.48)';
  ctx.lineWidth = 3;
  for (let x = (clock * 40) % 46; x < length - 10; x += 46) {
    ctx.beginPath();
    ctx.moveTo(x - 7, -9);
    ctx.lineTo(x + 5, 0);
    ctx.lineTo(x - 7, 9);
    ctx.stroke();
  }
  for (const x of [-70, length + 4]) {
    ctx.fillStyle = 'rgba(25, 167, 255, 0.12)';
    ctx.strokeStyle = 'rgba(127, 224, 255, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, -42, 66, 84, 9);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawFans(ctx: CanvasRenderingContext2D, level: Level, clock: number): void {
  const fan = fanFor(level);
  const perWatcher = fan.samples.length;
  ctx.save();
  for (let watcherIndex = 0; watcherIndex < level.watchers.length; watcherIndex++) {
    const watcher = level.watchers[watcherIndex];
    let start = -1;
    const pulse = 0.9 + 0.1 * Math.sin(clock * 2.4 + watcherIndex);
    ctx.fillStyle = `rgba(255, 90, 106, ${0.105 * pulse})`;
    ctx.strokeStyle = `rgba(255, 90, 106, ${0.3 * pulse})`;
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= perWatcher; i++) {
      const visible = i < perWatcher && fan.lines[watcherIndex * perWatcher + i].state === 'open';
      if (visible && start < 0) start = i;
      if (!visible && start >= 0) {
        const first = fan.samples[start];
        const last = fan.samples[i - 1];
        ctx.beginPath();
        ctx.moveTo(watcher.x, watcher.y);
        ctx.lineTo(first.x, first.y);
        ctx.lineTo(last.x, last.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        start = -1;
      }
    }
  }
  ctx.restore();
}

function fanFor(level: Level): { samples: Vec[]; lines: ReturnType<typeof computeCoverage>['lines'] } {
  const cached = FAN_CACHE.get(level.id);
  if (cached) return cached;
  const samples = sampleSegment(level.crossing.a, level.crossing.b, MAP_SAMPLES);
  const lines = computeCoverage(level.watchers, samples, wallsOf(level), []).lines;
  const fan = { samples, lines };
  FAN_CACHE.set(level.id, fan);
  return fan;
}

function drawBlocks(ctx: CanvasRenderingContext2D, level: Level): void {
  for (const block of level.blocks) {
    ctx.beginPath();
    block.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x + 10, point.y + 13);
      else ctx.lineTo(point.x + 10, point.y + 13);
    });
    ctx.closePath();
    ctx.fillStyle = COLOR.blockShadow;
    ctx.fill();
  }
  for (const block of level.blocks) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const point of block) {
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    const gradient = ctx.createLinearGradient(0, minY, 0, maxY);
    gradient.addColorStop(0, COLOR.blockTop);
    gradient.addColorStop(1, COLOR.blockBottom);
    ctx.beginPath();
    block.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = COLOR.blockEdge;
    ctx.globalAlpha = 0.78;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawThrower(ctx: CanvasRenderingContext2D, point: Vec): void {
  ctx.save();
  ctx.fillStyle = 'rgba(2, 8, 20, 0.55)';
  ctx.beginPath();
  ctx.ellipse(point.x, point.y + 12, 24, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLOR.blue;
  ctx.strokeStyle = COLOR.white;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(point.x, point.y, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLOR.white;
  ctx.beginPath();
  ctx.arc(point.x, point.y - 3, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawWatchers(ctx: CanvasRenderingContext2D, watchers: Vec[], clock: number): void {
  for (let i = 0; i < watchers.length; i++) {
    const point = watchers[i];
    const pulse = 1 + 0.12 * Math.sin(clock * 3 + i);
    ctx.fillStyle = 'rgba(255, 90, 106, 0.18)';
    ctx.beginPath();
    ctx.arc(point.x, point.y, 29 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLOR.coral;
    ctx.strokeStyle = COLOR.white;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawSquad(ctx: CanvasRenderingContext2D, level: Level, view: LiveView): void {
  const { a, b } = level.crossing;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const formation: Array<readonly [number, number]> = [[22, -13], [22, 13], [48, -26], [48, 0], [48, 26]];
  for (let i = 0; i < formation.length; i++) {
    const [back, side] = formation[i];
    const point = { x: a.x - ux * back + nx * side, y: a.y - uy * back + ny * side };
    ctx.fillStyle = view.lastResult ? (i < view.lastResult.saved ? COLOR.mint : COLOR.coral) : COLOR.cyan;
    ctx.strokeStyle = 'rgba(4, 12, 28, 0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawCloud(ctx: CanvasRenderingContext2D, center: Vec, radius: number, clock: number): void {
  const size = radius * (1 + 0.025 * Math.sin(clock * 1.8));
  const cloud = ctx.createRadialGradient(center.x - size * 0.25, center.y - size * 0.3, size * 0.08, center.x, center.y, size);
  cloud.addColorStop(0, 'rgba(244, 249, 255, 0.86)');
  cloud.addColorStop(0.62, 'rgba(210, 230, 255, 0.64)');
  cloud.addColorStop(1, 'rgba(127, 224, 255, 0.08)');
  ctx.fillStyle = cloud;
  ctx.beginPath();
  ctx.arc(center.x, center.y, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(244, 249, 255, 0.42)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawMarker(ctx: CanvasRenderingContext2D, center: Vec, radius: number, clock: number): void {
  ctx.save();
  ctx.strokeStyle = COLOR.cyan;
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 9]);
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = `rgba(127, 224, 255, ${0.45 + 0.25 * Math.sin(clock * 4)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius + 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = COLOR.white;
  ctx.beginPath();
  ctx.arc(center.x, center.y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Draws the moving canister while it is in flight. */
function drawCanister(ctx: CanvasRenderingContext2D, center: Vec): void {
  ctx.fillStyle = COLOR.amber;
  ctx.strokeStyle = COLOR.white;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(center.x, center.y, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}