import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/barlow-condensed/800-italic.css';
import '@fontsource/barlow/500.css';
import './style.css';
import './operator.css';

import type { Vec } from './core/types';
import { isMuted, setMuted, setQuiet, unlock, updateMusic } from './game/audio';
import { createGame } from './game/game';
import { createHud } from './game/hud';
import { LEVELS, WORLD } from './game/levels';
import { dayKey, mapOfTheDay, parFor } from './game/run';
import { createOperatorPanel } from './game/operator';
import { renderWorld } from './game/render';
import { createRenderer3D, type Renderer3D } from './game/render3d';
import {
  initialLiveView,
  onLiveSnapshotRequest,
  publishLive,
  publishLiveSnapshot,
  reduceLive,
  type LiveMessage,
} from './game/live';
import { registerServiceWorker } from './pwa';

const canvas = document.getElementById('world') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

// 3D diorama renderer by default. The flat 2D renderer is the safe mode: ?r=2d forces it, and the game
// drops to it on its own if WebGL is missing, the GPU context is lost, or the frame rate stays low.
const params = new URLSearchParams(location.search);
const SAFE_KEY = 'cloudcover-safe-mode';
const readSafe = (): boolean => {
  try {
    return sessionStorage.getItem(SAFE_KEY) === '1';
  } catch {
    return false;
  }
};
const writeSafe = (on: boolean): void => {
  try {
    if (on) sessionStorage.setItem(SAFE_KEY, '1');
    else sessionStorage.removeItem(SAFE_KEY);
  } catch {
    // Private windows may block storage; the switch still applies to this page.
  }
};
let r3d: Renderer3D | null = null;
if (params.get('r') !== '2d' && (params.get('r') === '3d' || !readSafe())) {
  try {
    const canvas3d = document.createElement('canvas');
    canvas3d.id = 'world3d';
    canvas.insertAdjacentElement('beforebegin', canvas3d);
    r3d = createRenderer3D(canvas3d);
    canvas.style.display = 'none';
    document.body.classList.add('r3d');
    canvas3d.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      useSafeMode('graphics context lost');
    });
    bindInput(canvas3d);
  } catch (error) {
    document.getElementById('world3d')?.remove();
    console.warn('3D renderer unavailable, using safe mode', error);
    r3d = null;
  }
}

/** Switch to the flat renderer for the rest of this browser session. */
function useSafeMode(reason: string): void {
  if (!r3d) return;
  console.warn(`Cloud Cover safe mode: ${reason}`);
  r3d.dispose();
  r3d = null;
  canvas.style.display = '';
  document.body.classList.remove('r3d');
  writeSafe(true);
  resize();
}

/** Leave safe mode: reload into the 3D renderer. */
function useFullGraphics(): void {
  writeSafe(false);
  const url = new URL(location.href);
  url.searchParams.delete('r');
  location.replace(url.toString());
}

// Frame-rate watchdog: three slow 2-second windows in a row (under 28 fps) switch to safe mode.
const watchdog = { start: 0, frames: 0, strikes: 0, since: performance.now() };
function watchFrameRate(now: number, gap: number): void {
  if (!r3d || document.hidden || now - watchdog.since < 4000) return;
  if (gap > 400) {
    // A long pause is a hidden tab or a debugger, not a slow GPU: start the window again.
    watchdog.start = now;
    watchdog.frames = 0;
    return;
  }
  if (!watchdog.start) watchdog.start = now;
  watchdog.frames++;
  const span = now - watchdog.start;
  if (span < 2000) return;
  const fps = (watchdog.frames * 1000) / span;
  watchdog.strikes = fps < 28 ? watchdog.strikes + 1 : 0;
  watchdog.start = now;
  watchdog.frames = 0;
  if (watchdog.strikes >= 3) useSafeMode(`low frame rate (${fps.toFixed(0)} fps)`);
}

let scale = 1;

/** Fit the 16:9 stage to the window and match the canvas backing store to the screen. */
function resize(): void {
  const unit = Math.min(window.innerWidth / WORLD.w, window.innerHeight / WORLD.h);
  document.documentElement.style.setProperty('--u', `${unit}px`);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  scale = unit * dpr;
  canvas.width = Math.round(WORLD.w * scale);
  canvas.height = Math.round(WORLD.h * scale);
  r3d?.resize(WORLD.w * unit, WORLD.h * unit, dpr);
}

function toWorld(event: PointerEvent): Vec {
  if (r3d) return r3d.screenToWorld(event.clientX, event.clientY) ?? game.state.aim;
  const box = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - box.left) / box.width) * WORLD.w,
    y: ((event.clientY - box.top) / box.height) * WORLD.h,
  };
}

// ?maps=id1,id2,... plays a fixed list of maps (for recorded demos and screenshots).
const fixedMaps = (new URLSearchParams(location.search).get('maps') ?? '')
  .split(',')
  .map((id) => LEVELS.find((l) => l.id === id.trim()))
  .filter((l): l is (typeof LEVELS)[number] => !!l);
const dailyTitle = (): string => (fixedMaps.length ? '' : mapOfTheDay(LEVELS, dayKey()).title);
const dailyPar = (): number | undefined => (fixedMaps.length ? undefined : parFor(game.state.run));

let lastAimPublish = Number.NEGATIVE_INFINITY;
let lastFlightPublish = Number.NEGATIVE_INFINITY;
let cloudPublished = false;
let liveSnapshot = initialLiveView();

/** Publishes live state without interrupting the game if browser messaging is unavailable. */
function sendLive(message: LiveMessage): void {
  liveSnapshot = reduceLive(liveSnapshot, message);
  publishLive(message);
}

/** Clears the current run from the board and starts a fresh idle timeout window. */
function sendLiveIdle(): void {
  cloudPublished = false;
  lastAimPublish = Number.NEGATIVE_INFINITY;
  lastFlightPublish = Number.NEGATIVE_INFINITY;
  sendLive({ type: 'idle' });
}

/** Last pointer position on screen, for the HOLD ring after a quick tap. */
const lastPointer = { x: 0, y: 0 };

const game = createGame({
  onRound: (index, level) => {
    cloudPublished = false;
    sendLive({ type: 'round', index, total: game.totalRounds, levelId: level.id });
    hud.showRound(index, level, game.totalRounds);
  },
  onAim: () => hud.showAim(),
  onTap: () => {
    const box = (document.getElementById('stage') as HTMLElement).getBoundingClientRect();
    hud.showHold(lastPointer.x - box.left, lastPointer.y - box.top);
  },
  onTimeUp: () => hud.showTimeUp(),
  onThrow: () => {
    sendLive({ type: 'flight', marker: { ...game.state.canister } });
    lastFlightPublish = Number.NEGATIVE_INFINITY;
    hud.showThrow();
  },
  onResult: (result) => {
    sendLive({
      type: 'result',
      ratio: result.ratio,
      grade: result.grade,
      saved: result.saved,
      points: result.points,
      score: game.state.score,
    });
    hud.showResult(result, game.state.roundIndex);
  },
  onSummary: (results, score) => {
    const par = fixedMaps.length ? undefined : parFor(game.state.run);
    sendLive({
      type: 'summary',
      score,
      saved: results.reduce((total, result) => total + result.saved, 0),
      squad: game.totalRounds * 5,
    });
    hud.showSummary(results, score, par);
  },
}, { maps: fixedMaps });

const hud = createHud(
  {
    play: () => {
      unlock();
      setMuted(isMuted());
      hud.hideAttract();
      game.start();
    },
    reset: () => {
      game.reset();
      sendLiveIdle();
    },
  },
  game.totalRounds,
);

/** Pointer handling for one game canvas (the 2D canvas, and the 3D canvas when it is in use). */
function bindInput(target: HTMLCanvasElement): void {
  target.addEventListener('pointermove', (event) => {
    lastPointer.x = event.clientX;
    lastPointer.y = event.clientY;
    game.pointer(toWorld(event));
  });
  target.addEventListener('pointerdown', (event) => {
    lastPointer.x = event.clientX;
    lastPointer.y = event.clientY;
    unlock();
    setMuted(isMuted());
    try {
      // Keep receiving the release even if the pointer leaves the canvas mid-charge.
      target.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic or already-released pointers cannot be captured; the throw still works.
    }
    game.pointer(toWorld(event));
    game.press();
  });
  target.addEventListener('pointerup', (event) => {
    game.pointer(toWorld(event));
    game.release();
  });
  target.addEventListener('pointercancel', () => game.release());
  target.addEventListener('contextmenu', (event) => event.preventDefault());
}
bindInput(canvas);
window.addEventListener('resize', resize);

if (import.meta.env.DEV) {
  // Handle for automated play-tests in the dev server only. Not present in the built game.
  (window as unknown as { __game: typeof game }).__game = game;
  (window as unknown as { __gpu: () => unknown }).__gpu = () => r3d?.stats() ?? null;
  (window as unknown as { __demo: () => unknown }).__demo = () => ({ on: demoOn, phase: demo.state.phase, t: demo.state.phaseTime });
}

let last = performance.now();
let lastInput = last;

/** Return the game and HUD to the attract screen. */
function resetToAttract(): void {
  game.reset();
  sendLiveIdle();
  hud.showAttract(dailyTitle(), dailyPar());
}

for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
  window.addEventListener(type, () => {
    lastInput = performance.now();
  }, true);
}
window.addEventListener('keydown', () => {
  lastInput = performance.now();
}, true);

const operator = createOperatorPanel({
  resetToAttract,
  setMuted,
  isMuted,
  graphics: () => (r3d ? '3d' : 'safe'),
  toggleGraphics: () => (r3d ? useSafeMode('operator') : useFullGraphics()),
});

window.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'o') {
    event.preventDefault();
    operator.toggle();
  } else if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'g') {
    // Hidden booth key: flip between full 3D and the flat safe mode.
    event.preventDefault();
    if (r3d) useSafeMode('operator key');
    else useFullGraphics();
  } else {
    hud.key(event);
  }
});

// ---------- Title-screen demo ----------
// Between players the title steps aside every few seconds and the game plays one perfect throw by itself,
// silently, on the first map. The queue learns aim, hold, release by watching. It runs on its own game
// instance, so the real run, the scores and the spectator feed never see it.
const DEMO_LEVEL = LEVELS.find((l) => l.id === 'open-gap') ?? LEVELS[0];
const TITLE_SECONDS = 8;
const demo = createGame({}, { maps: [DEMO_LEVEL] });
const attractEl = document.getElementById('attract') as HTMLElement;
let attractClock = 0;
let demoOn = false;

function startDemo(): void {
  demoOn = true;
  attractEl.classList.add('demo');
  setQuiet(true);
  demo.reset();
  demo.start();
  setQuiet(false);
}

function stopDemo(): void {
  demoOn = false;
  attractClock = 0;
  attractEl.classList.remove('demo');
}

function stepDemo(dt: number): void {
  const s = demo.state;
  setQuiet(true);
  if (s.phase === 'aim') {
    // Smoke straight onto the middle of the crossing: the clearest picture of the idea.
    const t = s.level.thrower;
    const { a, b } = s.level.crossing;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    demo.pointer(mid);
    const power = Math.hypot(mid.x - t.x, mid.y - t.y);
    if (!s.charging && s.phaseTime > 0.6) demo.press();
    else if (s.charging && s.charge >= power - 8) demo.release();
  }
  demo.update(dt);
  setQuiet(false);
  if (s.phase === 'summary' || (s.phase === 'result' && s.phaseTime > 1.3)) stopDemo();
}

/** Run the title/demo cycle while nobody is playing. */
function updateAttract(dt: number): void {
  if (game.state.phase !== 'attract' || operator.isOpen()) {
    if (demoOn) stopDemo();
    attractClock = 0;
    return;
  }
  attractClock += dt;
  if (!demoOn && attractClock >= TITLE_SECONDS) startDemo();
  if (demoOn) stepDemo(dt);
}

function frame(now: number): void {
  watchFrameRate(now, now - last);
  // Clamp the step so a stalled tab does not fast-forward the round timer.
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (now - lastInput > 45_000 && ['intro', 'aim', 'flight', 'reveal', 'result'].includes(game.state.phase)) {
    resetToAttract();
  }
  // Dev-only test hook: automated screenshots freeze time and step the game themselves.
  const frozen = import.meta.env.DEV && (window as unknown as { __freeze?: boolean }).__freeze === true;
  if (!frozen) game.update(dt);
  if (!frozen) updateAttract(dt);
  if (!frozen && hud.tick(dt)) {
    game.reset();
    sendLiveIdle();
    hud.showAttract(dailyTitle(), dailyPar());
  }
  hud.frame(game.state);
  const st = game.state;
  if (!frozen && st.phase === 'aim' && now - lastAimPublish >= 100) {
    sendLive({
      type: 'aim',
      marker: { ...st.marker },
      // The pro round hides the landing spot from the board too, so the player cannot read it off the second screen.
      charging: st.charging && !st.pro,
      ratio: st.charging ? st.live?.ratio ?? null : null,
    });
    lastAimPublish = now;
  }
  if (!frozen && st.phase === 'flight' && now - lastFlightPublish >= 100) {
    sendLive({ type: 'flight', marker: { ...st.canister } });
    lastFlightPublish = now;
  }
  if (!frozen && st.cloud && !cloudPublished) {
    sendLive({ type: 'cloud', center: { ...st.cloud.center }, radius: st.cloud.radius });
    cloudPublished = true;
  }
  updateMusic(st.phase, st.phase === 'aim' && st.charging ? Math.min(1, st.charge / Math.max(1, st.preview.length)) : 0);

  if (r3d) {
    r3d.render(demoOn ? demo.state : game.state);
  } else {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    renderWorld(ctx, demoOn ? demo.state : game.state);
  }
  requestAnimationFrame(frame);
}

resize();
hud.showAttract(dailyTitle(), dailyPar());
onLiveSnapshotRequest(() => publishLiveSnapshot(liveSnapshot));
sendLiveIdle();
registerServiceWorker();
requestAnimationFrame(frame);
