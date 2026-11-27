import floorUrl from '../assets/floor.jpg';
import roofUrl from '../assets/roof.jpg';
import runnerUrl from '../assets/runner.png';
import smokeAUrl from '../assets/smoke-a.png';
import smokeBUrl from '../assets/smoke-b.png';
import type { SightLine, Vec } from '../core/types';
import { ARENA, WORLD } from './levels';
import { SQUAD_SIZE, TIMING, type GameState, LIVE_READOUT_ROUNDS } from './state';

export const COLOR = {
  bgTop: '#06122a',
  bgBottom: '#0c2347',
  grid: 'rgba(130, 180, 255, 0.05)',
  arenaEdge: 'rgba(120, 180, 255, 0.35)',
  blockTop: '#2b4b80',
  blockBottom: '#1f3a68',
  blockEdge: '#6f9fe6',
  blockShadow: 'rgba(2, 8, 20, 0.5)',
  blue: '#19a7ff',
  cyan: '#7fe0ff',
  white: '#f4f9ff',
  coral: '#ff5a6a',
  mint: '#3df2b4',
  amber: '#ffc857',
} as const;

// Generated bitmap art (prompts in art-prompts/). Drawing falls back to flat colour until each image has loaded.
function loadImage(url: string): HTMLImageElement {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  return img;
}
const ART = {
  floor: loadImage(floorUrl),
  roof: loadImage(roofUrl),
  runner: loadImage(runnerUrl),
  smoke: [loadImage(smokeAUrl), loadImage(smokeBUrl)],
};
const patterns = new WeakMap<CanvasRenderingContext2D, { floor?: CanvasPattern; roof?: CanvasPattern }>();

/** A repeating pattern for a loaded texture, scaled to `size` world units per tile. */
function patternFor(ctx: CanvasRenderingContext2D, key: 'floor' | 'roof', size: number): CanvasPattern | null {
  const img = ART[key];
  if (!img.complete || img.naturalWidth === 0) return null;
  let cache = patterns.get(ctx);
  if (!cache) {
    cache = {};
    patterns.set(ctx, cache);
  }
  let pat = cache[key];
  if (!pat) {
    pat = ctx.createPattern(img, 'repeat') ?? undefined;
    if (!pat) return null;
    pat.setTransform(new DOMMatrix().scale(size / img.naturalWidth));
    cache[key] = pat;
  }
  return pat;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);
const easeOutBack = (t: number): number => {
  const c = 1.9;
  const x = clamp01(t) - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
};
const mix = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function poly(ctx: CanvasRenderingContext2D, pts: Vec[], dx = 0, dy = 0): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x + dx, p.y + dy) : ctx.lineTo(p.x + dx, p.y + dy)));
  ctx.closePath();
}

function drawBackdrop(ctx: CanvasRenderingContext2D, clock: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, WORLD.h);
  g.addColorStop(0, COLOR.bgTop);
  g.addColorStop(1, COLOR.bgBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);

  // Soft light pooling in the arena so the field reads as a lit floor.
  const glow = ctx.createRadialGradient(WORLD.w / 2, WORLD.h / 2 + 30, 60, WORLD.w / 2, WORLD.h / 2 + 30, 900);
  glow.addColorStop(0, 'rgba(40, 110, 200, 0.22)');
  glow.addColorStop(1, 'rgba(40, 110, 200, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h, 6);
  ctx.clip();
  const floor = patternFor(ctx, 'floor', 360);
  if (floor) {
    ctx.fillStyle = floor;
    ctx.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
    // Keep the floor quiet so the pieces read: pull it back towards the backdrop colour.
    const veil = ctx.createRadialGradient(WORLD.w / 2, WORLD.h / 2, 120, WORLD.w / 2, WORLD.h / 2, 980);
    veil.addColorStop(0, 'rgba(8, 26, 56, 0.28)');
    veil.addColorStop(1, 'rgba(4, 12, 28, 0.62)');
    ctx.fillStyle = veil;
    ctx.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
  }
  ctx.strokeStyle = COLOR.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = ARENA.x; x <= ARENA.x + ARENA.w; x += 50) {
    ctx.moveTo(x, ARENA.y);
    ctx.lineTo(x, ARENA.y + ARENA.h);
  }
  for (let y = ARENA.y + 40; y <= ARENA.y + ARENA.h; y += 50) {
    ctx.moveTo(ARENA.x, y);
    ctx.lineTo(ARENA.x + ARENA.w, y);
  }
  ctx.stroke();

  // Slow drifting haze bands: cheap life in the background.
  for (let i = 0; i < 3; i++) {
    const y = ARENA.y + 140 + i * 230 + Math.sin(clock * 0.15 + i * 2.1) * 30;
    const x = ((clock * (9 + i * 4) + i * 600) % (ARENA.w + 800)) - 400 + ARENA.x;
    const haze = ctx.createRadialGradient(x, y, 10, x, y, 380);
    haze.addColorStop(0, 'rgba(150, 200, 255, 0.045)');
    haze.addColorStop(1, 'rgba(150, 200, 255, 0)');
    ctx.fillStyle = haze;
    ctx.fillRect(x - 380, y - 380, 760, 760);
  }
  ctx.restore();

  ctx.strokeStyle = COLOR.arenaEdge;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h, 6);
  ctx.stroke();
}

function drawBlocks(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const block of state.level.blocks) {
    poly(ctx, block, 12, 16);
    ctx.fillStyle = COLOR.blockShadow;
    ctx.fill();
  }
  for (const block of state.level.blocks) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of block) {
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const g = ctx.createLinearGradient(0, minY, 0, maxY);
    g.addColorStop(0, COLOR.blockTop);
    g.addColorStop(1, COLOR.blockBottom);
    poly(ctx, block);
    ctx.fillStyle = g;
    ctx.fill();
    const roof = patternFor(ctx, 'roof', 220);
    if (roof) {
      ctx.fillStyle = roof;
      ctx.fill();
      // Light from the top edge so roofs read as raised.
      const shade = ctx.createLinearGradient(0, minY, 0, maxY);
      shade.addColorStop(0, 'rgba(160, 200, 255, 0.10)');
      shade.addColorStop(1, 'rgba(4, 12, 28, 0.30)');
      ctx.fillStyle = shade;
      ctx.fill();
    }

    // Roof hatching, clipped to the block.
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(160, 200, 255, 0.07)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = -900; k < 1700; k += 26) {
      ctx.moveTo(k, minY - 10);
      ctx.lineTo(k + (maxY - minY) + 20, maxY + 10);
    }
    ctx.stroke();
    ctx.restore();

    poly(ctx, block);
    ctx.strokeStyle = COLOR.blockEdge;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawCrossing(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { a, b } = state.level.crossing;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const half = 30;

  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(Math.atan2(uy, ux));

  ctx.fillStyle = 'rgba(25, 167, 255, 0.10)';
  ctx.fillRect(0, -half, len, half * 2);
  ctx.strokeStyle = 'rgba(127, 224, 255, 0.55)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(0, -half);
  ctx.lineTo(len, -half);
  ctx.moveTo(0, half);
  ctx.lineTo(len, half);
  ctx.stroke();
  ctx.setLineDash([]);

  // Chevrons flowing in the direction the squad will run.
  const gap = 44;
  const offset = (state.clock * 60) % gap;
  ctx.strokeStyle = 'rgba(127, 224, 255, 0.5)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let x = offset; x < len - 6; x += gap) {
    const fade = Math.min(1, x / 30, (len - x) / 30);
    ctx.globalAlpha = 0.25 + 0.5 * fade;
    ctx.beginPath();
    ctx.moveTo(x - 7, -11);
    ctx.lineTo(x + 5, 0);
    ctx.lineTo(x - 7, 11);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Safe pads: where the squad waits and where it is headed.
  for (const x0 of [-70, len + 4]) {
    ctx.fillStyle = 'rgba(25, 167, 255, 0.16)';
    ctx.strokeStyle = 'rgba(127, 224, 255, 0.8)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(x0, -44, 66, 88, 10);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** What each watcher can currently see of the crossing, as a translucent fan. */
function drawDangerFans(ctx: CanvasRenderingContext2D, state: GameState, alpha: number): void {
  if (alpha <= 0) return;
  const perWatcher = state.samples.length;
  // While charging, show the view as it would be with the cloud at the marker, so the
  // red fans shrink live and the fan learns cause and effect before letting go.
  const lines = state.charging && state.live ? state.live.lines : state.baseline.lines;
  if (state.charging && state.live) drawLiveBlocked(ctx, state, alpha);
  for (let w = 0; w < state.level.watchers.length; w++) {
    const from = state.level.watchers[w];
    const pulse = 0.85 + 0.15 * Math.sin(state.clock * 3 + w * 1.7);
    ctx.fillStyle = `rgba(255, 90, 106, ${0.13 * alpha * pulse})`;
    ctx.strokeStyle = `rgba(255, 90, 106, ${0.5 * alpha})`;
    ctx.lineWidth = 1.5;
    let runStart = -1;
    for (let i = 0; i <= perWatcher; i++) {
      const open = i < perWatcher && lines[w * perWatcher + i].state === 'open';
      if (open && runStart < 0) runStart = i;
      if (!open && runStart >= 0) {
        const first = state.samples[runStart];
        const last = state.samples[i - 1];
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(first.x, first.y);
        ctx.lineTo(last.x, last.y);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        ctx.lineTo(from.x, from.y);
        ctx.lineTo(last.x, last.y);
        ctx.stroke();
        runStart = -1;
      }
    }
  }
}

/** A bright scan beam per watcher, sweeping across the part of the crossing it can still see. */
function drawScanBeams(ctx: CanvasRenderingContext2D, state: GameState, alpha: number): void {
  if (alpha <= 0) return;
  const perWatcher = state.samples.length;
  const lines = state.charging && state.live ? state.live.lines : state.baseline.lines;
  ctx.save();
  ctx.lineCap = 'round';
  for (let w = 0; w < state.level.watchers.length; w++) {
    const open: number[] = [];
    for (let i = 0; i < perWatcher; i++) if (lines[w * perWatcher + i].state === 'open') open.push(i);
    if (!open.length) continue;
    const from = state.level.watchers[w];
    const t = 0.5 + 0.5 * Math.sin(state.clock * 1.8 + w * 2.1);
    const idx = open[Math.min(open.length - 1, Math.floor(t * open.length))];
    const to = state.samples[idx];
    const g = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
    g.addColorStop(0, `rgba(255, 90, 106, ${0.9 * alpha})`);
    g.addColorStop(1, `rgba(255, 90, 106, ${0.15 * alpha})`);
    ctx.strokeStyle = g;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.fillStyle = `rgba(255, 90, 106, ${0.8 * alpha})`;
    ctx.beginPath();
    ctx.arc(to.x, to.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Sight lines the marker cloud would cut, as faint green rays stopping at the cloud edge. */
function drawLiveBlocked(ctx: CanvasRenderingContext2D, state: GameState, alpha: number): void {
  const live = state.live;
  if (!live) return;
  ctx.save();
  ctx.strokeStyle = `rgba(61, 242, 180, ${0.35 * alpha})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const line of live.lines) {
    if (line.state !== 'cloud') continue;
    ctx.moveTo(line.from.x, line.from.y);
    ctx.lineTo(line.end.x, line.end.y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Live "% hidden" readout beside the landing ring while charging. */
function drawLiveReadout(ctx: CanvasRenderingContext2D, state: GameState): void {
  const live = state.live;
  if (state.phase !== 'aim' || !state.charging || !live || state.roundIndex >= LIVE_READOUT_ROUNDS) return;
  const pct = Math.round(live.ratio * 100);
  const m = state.marker;
  const r = state.level.cloudRadius;
  const color = pct >= 97 ? COLOR.mint : pct >= 70 ? COLOR.cyan : pct >= 35 ? COLOR.amber : COLOR.coral;
  ctx.save();
  ctx.font = '800 italic 34px "Barlow Condensed", sans-serif';
  const label = `${pct}%`;
  const w = Math.max(ctx.measureText(label).width, 52) + 28;
  const h = 62;
  // Sit outside the ring, on whichever side has room.
  const right = m.x + r + 14 + w < WORLD.w - 40;
  const x = right ? m.x + r + 14 : m.x - r - 14 - w;
  const y = Math.min(Math.max(m.y - h / 2, 120), WORLD.h - 60 - h);
  ctx.fillStyle = 'rgba(4, 12, 28, 0.88)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.fillText(label, x + w / 2, y + 36);
  ctx.font = '700 14px "Barlow Condensed", sans-serif';
  ctx.fillStyle = 'rgba(244, 249, 255, 0.8)';
  ctx.fillText('HIDDEN', x + w / 2, y + 53);
  ctx.restore();
}

/** "GO!" pops over the waiting squad just before it runs, and safe runners hop on arrival. */
function drawSquadBeat(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (state.phase !== 'reveal') return;
  const t = state.phaseTime - (TIMING.runStart - 0.35);
  if (t < 0 || t > 0.75) return;
  const { a, b } = state.level.crossing;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const x = a.x - ((b.x - a.x) / len) * 36;
  const y = a.y - ((b.y - a.y) / len) * 36 - 46;
  const pop = easeOutBack(t / 0.25);
  ctx.save();
  ctx.globalAlpha = t > 0.55 ? Math.max(0, 1 - (t - 0.55) / 0.2) : 1;
  ctx.translate(x, y);
  ctx.scale(pop, pop);
  ctx.font = '800 italic 40px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(4, 12, 28, 0.9)';
  ctx.strokeText('GO!', 0, 0);
  ctx.fillStyle = COLOR.cyan;
  ctx.fillText('GO!', 0, 0);
  ctx.restore();
}

function drawWatchers(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { a, b } = state.level.crossing;
  const mid = mix(a, b, 0.5);
  state.level.watchers.forEach((w, i) => {
    const angle = Math.atan2(mid.y - w.y, mid.x - w.x);
    const pulse = 0.5 + 0.5 * Math.sin(state.clock * 3 + i * 1.7);
    ctx.save();
    ctx.translate(w.x, w.y);

    ctx.strokeStyle = `rgba(255, 90, 106, ${0.25 + 0.25 * pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 30 + pulse * 6, 0, Math.PI * 2);
    ctx.stroke();

    ctx.rotate(angle);
    // Barrel pointing at the crossing.
    ctx.fillStyle = COLOR.coral;
    ctx.beginPath();
    ctx.roundRect(8, -4, 34, 8, 3);
    ctx.fill();
    ctx.fillStyle = '#2a0d16';
    ctx.strokeStyle = COLOR.coral;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // The eye.
    ctx.fillStyle = COLOR.coral;
    ctx.beginPath();
    ctx.arc(4, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawThrower(ctx: CanvasRenderingContext2D, state: GameState): void {
  const t = state.level.thrower;
  const dir = Math.atan2(state.aim.y - t.y, state.aim.x - t.x);
  const breathe = 0.5 + 0.5 * Math.sin(state.clock * 2.4);
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.strokeStyle = `rgba(25, 167, 255, ${0.35 + 0.2 * breathe})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 32 + breathe * 5, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = COLOR.blue;
  ctx.strokeStyle = COLOR.white;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (state.phase === 'aim' || state.phase === 'intro') {
    ctx.rotate(dir);
    ctx.fillStyle = COLOR.white;
    ctx.beginPath();
    ctx.moveTo(30, 0);
    ctx.lineTo(20, -7);
    ctx.lineTo(20, 7);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  ctx.font = '700 15px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(244, 249, 255, 0.85)';
  ctx.fillText('YOU', t.x, t.y + 52);
}

function dottedPath(ctx: CanvasRenderingContext2D, pts: Vec[], clock: number, color: string, alpha: number): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.setLineDash([2, 14]);
  ctx.lineDashOffset = -clock * 40;
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  ctx.restore();
}

/** The points of `path` from its start up to `distance` along it. */
function pathUpTo(path: Vec[], distance: number): Vec[] {
  const out: Vec[] = [path[0]];
  let left = distance;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= len) {
      const t = len > 0 ? left / len : 0;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      return out;
    }
    out.push(b);
    left -= len;
  }
  return out;
}

function drawAimGuide(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (state.phase !== 'aim') return;
  const path = state.preview.path;
  const full = state.level.assist === 'full' && !state.pro;
  const radius = state.level.cloudRadius;

  // The planned route. With full assist the whole bank is drawn; otherwise only the
  // first leg and a short stub of the rebound, and the rest is the player's read.
  if (state.pro) {
    // Pro round: only the first leg, up to the first wall.
    dottedPath(ctx, [path[0], path[1]], state.clock, COLOR.white, state.charging ? 0.35 : 0.7);
  } else if (full || path.length <= 2) {
    // At most three legs: a long zig-zag preview would cover the whole map.
    dottedPath(ctx, path.slice(0, 4), state.clock, COLOR.white, state.charging ? 0.35 : 0.7);
  } else {
    dottedPath(ctx, [path[0], path[1]], state.clock, COLOR.white, state.charging ? 0.35 : 0.7);
    const next = path[2];
    const dx = next.x - path[1].x;
    const dy = next.y - path[1].y;
    const len = Math.hypot(dx, dy) || 1;
    const stub = Math.min(110, len);
    const end = { x: path[1].x + (dx / len) * stub, y: path[1].y + (dy / len) * stub };
    const g = ctx.createLinearGradient(path[1].x, path[1].y, end.x, end.y);
    g.addColorStop(0, 'rgba(255, 200, 87, 0.95)');
    g.addColorStop(1, 'rgba(255, 200, 87, 0)');
    ctx.save();
    ctx.strokeStyle = g;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(path[1].x, path[1].y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }

  // Bounce markers on the visible part of the route.
  const lastMarker = state.pro ? 0 : full ? Math.min(3, path.length - 1) : Math.min(2, path.length - 1);
  for (let i = 1; i < lastMarker; i++) {
    const p = path[i];
    ctx.fillStyle = COLOR.amber;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 200, 87, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 13 + 3 * Math.sin(state.clock * 6), 0, Math.PI * 2);
    ctx.stroke();
  }

  if (!state.charging) return;

  // Live power: a solid line runs out along the route and the ring shows the landing right now.
  const live = state.pro ? [] : pathUpTo(path, state.charge);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = COLOR.cyan;
  ctx.shadowBlur = 16;
  ctx.strokeStyle = COLOR.cyan;
  ctx.lineWidth = 5;
  ctx.beginPath();
  live.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  ctx.restore();

  const m = state.marker;
  ctx.save();
  if (state.pro) ctx.globalAlpha = 0;
  ctx.fillStyle = 'rgba(244, 249, 255, 0.14)';
  ctx.strokeStyle = COLOR.white;
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 9]);
  ctx.lineDashOffset = state.clock * 30;
  ctx.beginPath();
  ctx.arc(m.x, m.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = COLOR.white;
  ctx.beginPath();
  ctx.arc(m.x, m.y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Power gauge around the thrower.
  const t = state.level.thrower;
  const top = Math.max(1, state.preview.length);
  const share = Math.max(0, Math.min(1, state.charge / top));
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(155, 182, 220, 0.25)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(t.x, t.y, 44, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = share > 0.85 ? COLOR.amber : COLOR.cyan;
  ctx.beginPath();
  ctx.arc(t.x, t.y, 44, -Math.PI / 2, -Math.PI / 2 + share * Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawCanister(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (state.phase !== 'flight' || !state.thrown) return;
  const p = state.canister;
  const spin = state.phaseTime * 22;
  ctx.save();
  ctx.translate(p.x, p.y);
  const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, 34);
  halo.addColorStop(0, 'rgba(244, 249, 255, 0.55)');
  halo.addColorStop(1, 'rgba(244, 249, 255, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(spin);
  ctx.fillStyle = COLOR.white;
  ctx.beginPath();
  ctx.roundRect(-11, -7, 22, 14, 5);
  ctx.fill();
  ctx.fillStyle = COLOR.blue;
  ctx.fillRect(-3, -7, 6, 14);
  ctx.restore();
}

function drawCloud(ctx: CanvasRenderingContext2D, state: GameState): void {
  const cloud = state.cloud;
  if (!cloud) return;
  const age = state.phase === 'reveal' ? state.phaseTime : TIMING.reveal + state.phaseTime;
  const { center, radius } = cloud;
  const sprites = ART.smoke;
  const ready = sprites.every((img) => img.complete && img.naturalWidth > 0);

  ctx.save();
  ctx.translate(center.x, center.y);

  // Ground shadow under the cloud so it sits on the map, not on the glass.
  const shadow = ctx.createRadialGradient(10, 14, radius * 0.3, 10, 14, radius * 1.25);
  shadow.addColorStop(0, `rgba(2, 8, 20, ${0.45 * clamp01(age / TIMING.bloom)})`);
  shadow.addColorStop(1, 'rgba(2, 8, 20, 0)');
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.arc(10, 14, radius * 1.25, 0, Math.PI * 2);
  ctx.fill();

  // Solid core at the true blocking radius, so what you see is what counts.
  const grow = easeOutBack(age / TIMING.bloom);
  const core = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius * grow);
  core.addColorStop(0, 'rgba(240, 247, 255, 0.92)');
  core.addColorStop(0.85, 'rgba(214, 232, 252, 0.78)');
  core.addColorStop(1, 'rgba(214, 232, 252, 0.0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(1, radius * grow), 0, Math.PI * 2);
  ctx.fill();

  for (const puff of state.puffs) {
    const k = easeOutBack((age - puff.delay) / (TIMING.bloom * 1.4));
    if (k <= 0) continue;
    // Puffs burst outward from the canister and then drift and breathe.
    const drift = Math.min(1, age / 4);
    const x = puff.dx * k + Math.sin(state.clock * 0.9 + puff.phase) * 4 * drift;
    const y = puff.dy * k + Math.cos(state.clock * 0.7 + puff.phase) * 3 * drift;
    const r = puff.r * k * (1 + 0.04 * Math.sin(state.clock * 1.6 + puff.phase));
    if (ready) {
      const img = sprites[puff.sprite % sprites.length];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(puff.angle + puff.spin * age);
      ctx.globalAlpha = 0.92;
      ctx.drawImage(img, -r * 1.25, -r * 1.25, r * 2.5, r * 2.5);
      ctx.restore();
    } else {
      const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
      g.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      g.addColorStop(0.7, 'rgba(232, 243, 255, 0.75)');
      g.addColorStop(1, 'rgba(210, 230, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawSweep(ctx: CanvasRenderingContext2D, state: GameState): void {
  const coverage = state.coverage;
  if (!coverage || (state.phase !== 'reveal' && state.phase !== 'result')) return;
  const t = state.phase === 'reveal' ? state.phaseTime : TIMING.reveal;
  const p = easeOutCubic((t - TIMING.sweepStart) / TIMING.sweepLength);
  if (p <= 0) return;
  const fade = state.phase === 'result' ? Math.max(0, 1 - state.phaseTime / 0.5) : 1;

  ctx.save();
  ctx.lineCap = 'round';
  for (const line of coverage.lines) {
    if (line.state === 'wall') continue;
    const tip = mix(line.from, line.end, p);
    const blocked = line.state === 'cloud';
    ctx.strokeStyle = blocked ? COLOR.mint : COLOR.coral;
    ctx.globalAlpha = (blocked ? 0.5 : 0.85) * fade;
    ctx.lineWidth = blocked ? 2 : 3;
    ctx.beginPath();
    ctx.moveTo(line.from.x, line.from.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    if (p >= 1) drawLineEnd(ctx, line, fade);
  }
  ctx.restore();
}

function drawLineEnd(ctx: CanvasRenderingContext2D, line: SightLine, fade: number): void {
  ctx.globalAlpha = fade;
  ctx.fillStyle = line.state === 'cloud' ? COLOR.mint : COLOR.coral;
  ctx.beginPath();
  ctx.arc(line.end.x, line.end.y, line.state === 'cloud' ? 4 : 5.5, 0, Math.PI * 2);
  ctx.fill();
}

/** Where each squad member stands while waiting in cover: [distance behind the line, sideways offset]. */
const FORMATION: ReadonlyArray<readonly [number, number]> = [
  [22, -13],
  [22, 13],
  [48, -26],
  [48, 0],
  [48, 26],
];

function drawSquad(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { a, b } = state.level.crossing;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;

  const running = state.phase === 'reveal' || state.phase === 'result';
  const t = state.phase === 'reveal' ? state.phaseTime : TIMING.reveal + state.phaseTime;

  for (let i = 0; i < SQUAD_SIZE; i++) {
    const runner = state.runners[i];
    const [back, side] = FORMATION[i];
    let along = -back;
    let lane = side;
    let alpha = 1;
    let spotted = false;
    if (running && runner) {
      const local = (t - TIMING.runStart - runner.delay) / TIMING.runLength;
      const progress = easeOutCubic(local);
      const safe = runner.stopAt >= 1;
      const target = safe ? len + back : runner.stopAt * len;
      along = along + (target - along) * progress;
      if (!safe) {
        lane = side * (1 - progress) + runner.lane * progress;
        if (local > 0.8) {
          spotted = true;
          alpha = Math.max(0.3, 1 - (local - 0.8) * 1.2);
        }
      }
    }
    let bob = running ? 0 : Math.sin(state.clock * 3 + i * 1.3) * 1.5;
    if (running && runner && runner.stopAt >= 1) {
      const arrived = t - TIMING.runStart - runner.delay - TIMING.runLength * 0.85;
      if (arrived > 0) bob = -Math.abs(Math.sin(arrived * 9 + i)) * 7 * Math.max(0, 1 - arrived / 1.6);
    }
    const x = a.x + ux * along + nx * lane;
    const y = a.y + uy * along + ny * lane + bob;

    ctx.save();
    ctx.globalAlpha = alpha;
    const sprite = ART.runner;
    if (sprite.complete && sprite.naturalWidth > 0) {
      // The sprite faces up the screen; turn it to face along the crossing.
      const size = 34;
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(uy, ux) + Math.PI / 2);
      if (running && !spotted) ctx.rotate(Math.sin(state.clock * 22 + i) * 0.08);
      if (spotted) {
        // A red halo under a spotted runner.
        ctx.fillStyle = 'rgba(255, 90, 106, 0.45)';
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.48, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = alpha;
    } else {
      ctx.fillStyle = spotted ? COLOR.coral : COLOR.cyan;
      ctx.strokeStyle = '#06122a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, 9.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (spotted) {
      ctx.strokeStyle = COLOR.coral;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 7, y - 7);
      ctx.lineTo(x + 7, y + 7);
      ctx.moveTo(x + 7, y - 7);
      ctx.lineTo(x - 7, y + 7);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawEffects(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const ring of state.rings) {
    const k = 1 - ring.life / ring.max;
    ctx.strokeStyle = ring.color;
    ctx.globalAlpha = (1 - k) * 0.8;
    ctx.lineWidth = 5 * (1 - k) + 1;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.from + (ring.to - ring.from) * easeOutCubic(k), 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Draw one frame of the world. The context is already scaled to world units. */
export function renderWorld(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.save();
  if (state.shake > 0) {
    ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
  }
  drawBackdrop(ctx, state.clock);
  drawCrossing(ctx, state);

  const fanAlpha =
    state.phase === 'aim' || state.phase === 'intro' || state.phase === 'attract'
      ? 1
      : state.phase === 'flight'
        ? 0.7
        : state.phase === 'reveal'
          ? Math.max(0, 0.7 - state.phaseTime * 2.5)
          : 0;
  drawDangerFans(ctx, state, fanAlpha);
  drawScanBeams(ctx, state, state.phase === 'aim' || state.phase === 'intro' || state.phase === 'attract' ? 1 : 0);
  drawBlocks(ctx, state);
  drawSquad(ctx, state);
  drawSquadBeat(ctx, state);
  drawWatchers(ctx, state);
  drawThrower(ctx, state);
  drawSweep(ctx, state);
  drawCloud(ctx, state);
  drawAimGuide(ctx, state);
  drawLiveReadout(ctx, state);
  drawCanister(ctx, state);
  drawEffects(ctx, state);
  ctx.restore();
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(220, 255, 240, ${state.flash * 0.45})`;
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  }
}
