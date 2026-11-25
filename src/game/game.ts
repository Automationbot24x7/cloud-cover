import { computeThrow } from '../core/throw';
import type { Coverage, Vec } from '../core/types';
import { computeCoverage, sampleSegment } from '../core/vision';
import { chargeTone, sfx } from './audio';
import { LEVELS, THROW, wallsOf, type Level } from './levels';
import { buildRun, dayKey, hashString, RUN_TIERS, seededRandom } from './run';
import { COLOR } from './render';
import { CHARGE_SPEED, SQUAD_SIZE, TIMING, type GameState, type Grade, type Puff, type RoundResult, type Runner } from './state';

/** How many points along the crossing each watcher is tested against. */
const SAMPLES = 24;
/** Keep the test points off the cover walls at each end of the crossing. */
const SAMPLE_INSET = 14;
const FLIGHT_SPEED = 2300;

export interface GameHooks {
  /** A new round is on screen (intro banner). */
  onRound?(index: number, level: Level): void;
  /** Aiming has started. */
  onAim?(): void;
  /** The round timer ran out (an automatic throw follows). */
  onTimeUp?(): void;
  /** The canister has left the hand. */
  onThrow?(): void;
  /** The round has been scored. */
  onResult?(result: RoundResult): void;
  /** The last round is over. */
  onSummary?(results: RoundResult[], score: number): void;
}

/** Small deterministic generator so a cloud looks the same every time it is drawn. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function samplesFor(level: Level): Vec[] {
  const { a, b } = level.crossing;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const k = SAMPLE_INSET / len;
  const start = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  const end = { x: b.x - (b.x - a.x) * k, y: b.y - (b.y - a.y) * k };
  return sampleSegment(start, end, SAMPLES);
}

function gradeFor(ratio: number): Grade {
  if (ratio >= 0.97) return 3;
  if (ratio >= 0.7) return 2;
  if (ratio >= 0.35) return 1;
  return 0;
}

export const GRADE_LABEL: Record<Grade, string> = {
  0: 'EXPOSED',
  1: 'THIN COVER',
  2: 'COVERED',
  3: 'PERFECT COVER',
};

/** The puffs that make up one cloud: a dense core, a ring of billows and a few stray wisps. */
function makePuffs(radius: number, seed: number): Puff[] {
  const rand = mulberry(seed);
  const puffs: Puff[] = [];
  const puff = (dx: number, dy: number, r: number, delay: number, sprite: number): void => {
    puffs.push({ dx, dy, r, phase: rand() * 6.28, delay, sprite, angle: rand() * 6.28, spin: (rand() - 0.5) * 0.5 });
  };
  for (let i = 0; i < 3; i++) {
    const a = rand() * 6.28;
    puff(Math.cos(a) * radius * 0.18, Math.sin(a) * radius * 0.18, radius * (0.62 + rand() * 0.12), i * 0.03, 0);
  }
  const ring = 10;
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2 + rand() * 0.4;
    const r = radius * (0.36 + rand() * 0.14);
    const d = radius - r * 0.8;
    puff(Math.cos(a) * d, Math.sin(a) * d, r, 0.04 + rand() * 0.12, i % 2);
  }
  for (let i = 0; i < 4; i++) {
    const a = rand() * 6.28;
    const d = radius * (0.95 + rand() * 0.2);
    puff(Math.cos(a) * d, Math.sin(a) * d, radius * (0.2 + rand() * 0.1), 0.12 + rand() * 0.2, 1);
  }
  return puffs;
}

/** Decide where each runner ends up: safe across, or stopped at a point a watcher can still see. */
function makeRunners(saved: number, coverage: Coverage, sampleCount: number): Runner[] {
  const openAt: number[] = [];
  coverage.lines.forEach((line, i) => {
    if (line.state === 'open') openAt.push((i % sampleCount) / Math.max(1, sampleCount - 1));
  });
  const runners: Runner[] = [];
  for (let i = 0; i < SQUAD_SIZE; i++) {
    const safe = i < saved;
    let stopAt = 1;
    if (!safe) {
      const pick = openAt.length ? openAt[Math.floor(((i - saved + 0.5) / (SQUAD_SIZE - saved)) * openAt.length)] : 0.5;
      stopAt = 0.12 + pick * 0.76;
    }
    runners.push({ delay: i * 0.07, lane: (i - 2) * 9, stopAt });
  }
  return runners;
}

export interface Game {
  state: GameState;
  /** Advance the simulation by `dt` seconds. */
  update(dt: number): void;
  /** Pointer moved to this world position. */
  pointer(world: Vec): void;
  /** Button down: start building power. */
  press(): void;
  /** Button up: throw with the power built so far. */
  release(): void;
  /** Begin a fresh run from round one. */
  start(): void;
  /** Return to the idle attract screen. */
  reset(): void;
  totalRounds: number;
}

export interface GameOptions {
  /** Play these maps in this order instead of a random run (used for recorded demos and tests). */
  maps?: Level[];
}

/**
 * The run: a fixed list if one was given, otherwise today's six maps by tier, the same for every player
 * all day (seeded by the date) so the daily leaderboard is a fair contest. The set changes at midnight.
 */
function newRun(options: GameOptions): Level[] {
  if (options.maps && options.maps.length) return options.maps;
  const day = dayKey();
  return buildRun(LEVELS, seededRandom(hashString(`run:${day}`)), day);
}

export function createGame(hooks: GameHooks = {}, options: GameOptions = {}): Game {
  const firstRun = newRun(options);
  const first = firstRun[0];
  const state: GameState = {
    phase: 'attract',
    phaseTime: 0,
    clock: 0,
    roundIndex: 0,
    run: firstRun,
    level: first,
    walls: [],
    samples: [],
    baseline: { lines: [], wall: 0, cloud: 0, open: 0, ratio: 1 },
    aim: { x: 0, y: 0 },
    aimed: false,
    preview: { path: [first.thrower, first.thrower], landing: first.thrower, bounces: 0, length: 0 },
    charging: false,
    charge: THROW.minRange,
    chargeDir: 1,
    marker: { ...first.thrower },
    live: null,
    timeLeft: 0,
    thrown: null,
    flightDuration: 0.4,
    bouncesHeard: 0,
    canister: { ...first.thrower },
    cloud: null,
    puffs: [],
    coverage: null,
    blocksHeard: 0,
    runners: [],
    results: [],
    score: 0,
    shownScore: 0,
    particles: [],
    rings: [],
    shake: 0,
    flash: 0,
  };

  let timeAtThrow = 0;
  let lastTick = 0;
  let pending: RoundResult | null = null;
  /** Sound cues already played this round, so each fires once. */
  let goPlayed = false;
  let spottedPlayed = 0;

  function setPhase(phase: GameState['phase']): void {
    state.phase = phase;
    state.phaseTime = 0;
  }

  /** A point `range` units from the thrower in the aimed direction. */
  function aimPoint(range: number): Vec {
    const t = state.level.thrower;
    const dx = state.aim.x - t.x;
    const dy = state.aim.y - t.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return { x: t.x + range, y: t.y };
    return { x: t.x + (dx / len) * range, y: t.y + (dy / len) * range };
  }

  function refreshPreview(): void {
    state.preview = computeThrow(state.level.thrower, aimPoint(THROW.maxRange), state.walls, THROW);
    state.marker = pointAlong(state.preview.path, Math.min(state.charge, state.preview.length)).point;
  }

  function loadRound(index: number): void {
    const level = state.run[index];
    state.roundIndex = index;
    state.level = level;
    state.walls = wallsOf(level);
    state.samples = samplesFor(level);
    state.baseline = computeCoverage(level.watchers, state.samples, state.walls, []);
    const { a, b } = level.crossing;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dx = mid.x - level.thrower.x;
    const dy = mid.y - level.thrower.y;
    const len = Math.hypot(dx, dy) || 1;
    if (!state.aimed) {
      state.aim = { x: level.thrower.x + (dx / len) * 320, y: level.thrower.y + (dy / len) * 320 };
    }
    state.timeLeft = level.seconds;
    state.charging = false;
    state.charge = THROW.minRange;
    state.chargeDir = 1;
    state.live = null;
    state.thrown = null;
    state.cloud = null;
    state.coverage = null;
    state.puffs = [];
    state.runners = [];
    state.bouncesHeard = 0;
    state.blocksHeard = 0;
    goPlayed = false;
    spottedPlayed = 0;
    state.canister = { ...level.thrower };
    lastTick = Math.ceil(level.seconds);
    refreshPreview();
  }

  function burst(at: Vec, count: number, speed: number, color: string, size: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.65);
      const life = 0.35 + Math.random() * 0.45;
      state.particles.push({
        x: at.x,
        y: at.y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life,
        max: life,
        size: size * (0.6 + Math.random() * 0.8),
        color,
      });
    }
  }

  function land(): void {
    const thrown = state.thrown;
    if (!thrown) return;
    const level = state.level;
    state.cloud = { center: thrown.landing, radius: level.cloudRadius };
    state.puffs = makePuffs(level.cloudRadius, state.roundIndex * 977 + Math.round(thrown.landing.x * 3 + thrown.landing.y));
    const coverage = computeCoverage(level.watchers, state.samples, state.walls, [state.cloud]);
    state.coverage = coverage;

    const ratio = coverage.ratio;
    const grade = gradeFor(ratio);
    const basePoints = Math.round(ratio * 800);
    const timeBonus = ratio >= 0.5 ? Math.round(200 * Math.max(0, timeAtThrow) / level.seconds) : 0;
    const styleBonus = ratio >= 0.7 ? thrown.bounces * 75 : 0;
    const saved = grade === 3 ? SQUAD_SIZE : Math.round(SQUAD_SIZE * ratio);
    pending = {
      levelId: level.id,
      ratio,
      grade,
      points: basePoints + timeBonus + styleBonus,
      basePoints,
      timeBonus,
      styleBonus,
      saved,
      bounces: thrown.bounces,
    };
    state.runners = makeRunners(saved, coverage, state.samples.length);

    sfx.bloom();
    state.shake = 9;
    state.rings.push({
      x: thrown.landing.x,
      y: thrown.landing.y,
      life: 0.6,
      max: 0.6,
      from: 10,
      to: level.cloudRadius * 1.7,
      color: COLOR.white,
    });
    burst(thrown.landing, 28, 420, COLOR.white, 4);
    setPhase('reveal');
  }

  function pointAlong(path: Vec[], distance: number): { point: Vec; segment: number } {
    let left = distance;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (left <= len || i === path.length - 1) {
        const t = len > 0 ? Math.min(1, left / len) : 1;
        return { point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, segment: i - 1 };
      }
      left -= len;
    }
    return { point: path[path.length - 1], segment: Math.max(0, path.length - 2) };
  }

  function press(): void {
    if (state.phase !== 'aim' || state.charging) return;
    state.charging = true;
    state.charge = THROW.minRange;
    state.chargeDir = 1;
    chargeTone.start();
    refreshPreview();
  }

  function release(): void {
    if (state.phase !== 'aim' || !state.charging) return;
    fire(state.charge);
  }

  function fire(range: number): void {
    if (state.phase !== 'aim') return;
    timeAtThrow = state.timeLeft;
    state.charging = false;
    state.live = null;
    chargeTone.stop();
    state.thrown = computeThrow(state.level.thrower, aimPoint(range), state.walls, THROW);
    state.flightDuration = Math.min(0.8, Math.max(0.26, state.thrown.length / FLIGHT_SPEED));
    state.bouncesHeard = 0;
    sfx.throw();
    hooks.onThrow?.();
    setPhase('flight');
  }

  function update(dt: number): void {
    state.clock += dt;
    state.phaseTime += dt;
    state.shownScore += (state.score - state.shownScore) * Math.min(1, dt * 9);
    if (Math.abs(state.score - state.shownScore) < 0.6) state.shownScore = state.score;
    state.shake = Math.max(0, state.shake - dt * 30);
    state.flash = Math.max(0, state.flash - dt * 2.2);

    for (const p of state.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - Math.min(1, dt * 3.5);
      p.vy *= 1 - Math.min(1, dt * 3.5);
      p.life -= dt;
    }
    state.particles = state.particles.filter((p) => p.life > 0);
    for (const r of state.rings) r.life -= dt;
    state.rings = state.rings.filter((r) => r.life > 0);

    switch (state.phase) {
      case 'intro':
        if (state.phaseTime >= TIMING.intro) {
          setPhase('aim');
          hooks.onAim?.();
        }
        break;

      case 'aim': {
        state.timeLeft -= dt;
        const whole = Math.ceil(state.timeLeft);
        if (whole < lastTick && whole <= 3 && whole >= 1) sfx.tick();
        lastTick = whole;
        if (state.charging) {
          const top = Math.max(THROW.minRange + 1, state.preview.length);
          state.charge += CHARGE_SPEED * dt * state.chargeDir;
          if (state.charge >= top) {
            state.charge = top;
            state.chargeDir = -1;
          } else if (state.charge <= THROW.minRange) {
            state.charge = THROW.minRange;
            state.chargeDir = 1;
          }
          state.marker = pointAlong(state.preview.path, state.charge).point;
          state.live = computeCoverage(state.level.watchers, state.samples, state.walls, [
            { center: state.marker, radius: state.level.cloudRadius },
          ]);
          chargeTone.set((state.charge - THROW.minRange) / (top - THROW.minRange));
        }
        if (state.timeLeft <= 0) {
          state.timeLeft = 0;
          // Out of time: throw with whatever power is built, or a short lob if the button was never held.
          hooks.onTimeUp?.();
          fire(state.charging ? state.charge : Math.min(state.preview.length, 420));
        }
        break;
      }

      case 'flight': {
        const thrown = state.thrown;
        if (!thrown) break;
        const k = Math.min(1, state.phaseTime / state.flightDuration);
        // Ease out a touch so the canister settles instead of stopping dead.
        const eased = 1 - Math.pow(1 - k, 1.6);
        const { point, segment } = pointAlong(thrown.path, thrown.length * eased);
        state.canister = point;
        while (state.bouncesHeard < segment && state.bouncesHeard < thrown.bounces) {
          const at = thrown.path[state.bouncesHeard + 1];
          sfx.bounce(state.bouncesHeard);
          burst(at, 10, 300, COLOR.amber, 3);
          state.rings.push({ x: at.x, y: at.y, life: 0.3, max: 0.3, from: 4, to: 38, color: COLOR.amber });
          state.shake = Math.max(state.shake, 4);
          state.bouncesHeard += 1;
        }
        if (Math.random() < dt * 90) {
          state.particles.push({
            x: point.x,
            y: point.y,
            vx: (Math.random() - 0.5) * 40,
            vy: (Math.random() - 0.5) * 40,
            life: 0.3,
            max: 0.3,
            size: 3.5,
            color: 'rgba(244, 249, 255, 0.8)',
          });
        }
        if (k >= 1) land();
        break;
      }

      case 'reveal': {
        const coverage = state.coverage;
        if (coverage) {
          const sweep = (state.phaseTime - TIMING.sweepStart) / TIMING.sweepLength;
          const due = Math.floor(Math.max(0, Math.min(1, sweep)) * Math.min(6, coverage.cloud));
          while (state.blocksHeard < due) {
            sfx.block(state.blocksHeard);
            state.blocksHeard += 1;
          }
        }
        if (!goPlayed && state.phaseTime >= TIMING.runStart - 0.35) {
          goPlayed = true;
          sfx.go();
        }
        // A sting for each runner the moment a watcher spots them (same timing the renderers use).
        const spottedNow = state.runners.filter(
          (r) => r.stopAt < 1 && (state.phaseTime - TIMING.runStart - r.delay) / TIMING.runLength > 0.8,
        ).length;
        if (spottedNow > spottedPlayed) {
          spottedPlayed = spottedNow;
          sfx.spotted();
        }
        if (state.phaseTime >= TIMING.reveal && pending) {
          const result = pending;
          pending = null;
          state.results.push(result);
          state.score += result.points;
          sfx.result(result.grade);
          if (result.grade === 3 && state.cloud) {
            // Perfect cover: make it feel like one.
            state.flash = 0.55;
            state.shake = 12;
            const c = state.cloud.center;
            state.rings.push({ x: c.x, y: c.y, life: 0.8, max: 0.8, from: state.cloud.radius, to: state.cloud.radius * 3.2, color: COLOR.mint });
            burst(c, 46, 620, COLOR.mint, 4.5);
            const { b } = state.level.crossing;
            burst(b, 30, 380, COLOR.cyan, 3.5);
          }
          hooks.onResult?.(result);
          setPhase('result');
        }
        break;
      }

      case 'result':
        if (state.phaseTime >= TIMING.result) {
          if (state.roundIndex + 1 < state.run.length) {
            loadRound(state.roundIndex + 1);
            setPhase('intro');
            hooks.onRound?.(state.roundIndex, state.level);
          } else {
            setPhase('summary');
            hooks.onSummary?.(state.results, state.score);
          }
        }
        break;

      default:
        break;
    }
  }

  function pointer(world: Vec): void {
    state.aim = world;
    state.aimed = true;
    if (state.phase === 'aim' || state.phase === 'intro') refreshPreview();
  }

  function start(): void {
    state.results = [];
    state.score = 0;
    state.shownScore = 0;
    state.particles = [];
    state.rings = [];
    pending = null;
    state.run = newRun(options);
    loadRound(0);
    setPhase('intro');
    sfx.start();
    hooks.onRound?.(0, state.level);
  }

  function reset(): void {
    state.results = [];
    state.score = 0;
    state.shownScore = 0;
    state.aimed = false;
    pending = null;
    chargeTone.stop();
    state.run = newRun(options);
    loadRound(0);
    setPhase('attract');
  }

  loadRound(0);

  return { state, update, pointer, press, release, start, reset, totalRounds: options.maps?.length || RUN_TIERS.length };
}
