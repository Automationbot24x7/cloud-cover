import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/barlow-condensed/800-italic.css';
import '@fontsource/barlow/500.css';
import './style.css';
import './operator.css';

import type { Vec } from './core/types';
import { isMuted, setMuted, unlock, updateMusic } from './game/audio';
import { createGame } from './game/game';
import { createHud } from './game/hud';
import { LEVELS, WORLD } from './game/levels';
import { dayKey, mapOfTheDay } from './game/run';
import { createOperatorPanel } from './game/operator';
import { renderWorld } from './game/render';
import { createRenderer3D, type Renderer3D } from './game/render3d';
import { registerServiceWorker } from './pwa';

const canvas = document.getElementById('world') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

// 3D diorama renderer, behind a switch while it is being tested: add ?r=3d to the address.
const use3d = new URLSearchParams(location.search).get('r') === '3d';
let r3d: Renderer3D | null = null;
if (use3d) {
  const canvas3d = document.createElement('canvas');
  canvas3d.id = 'world3d';
  canvas.insertAdjacentElement('beforebegin', canvas3d);
  canvas.style.display = 'none';
  r3d = createRenderer3D(canvas3d);
}
const input: HTMLCanvasElement = r3d ? r3d.canvas : canvas;

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

const game = createGame({
  onRound: (index, level) => hud.showRound(index, level, game.totalRounds),
  onAim: () => hud.showAim(),
  onThrow: () => hud.showThrow(),
  onResult: (result) => hud.showResult(result, game.state.roundIndex),
  onSummary: (results, score) => hud.showSummary(results, score),
}, { maps: fixedMaps });

const hud = createHud(
  {
    play: () => {
      unlock();
      setMuted(isMuted());
      hud.hideAttract();
      game.start();
    },
    reset: () => game.reset(),
  },
  game.totalRounds,
);

input.addEventListener('pointermove', (event) => game.pointer(toWorld(event)));
input.addEventListener('pointerdown', (event) => {
  unlock();
  setMuted(isMuted());
  try {
    // Keep receiving the release even if the pointer leaves the canvas mid-charge.
    input.setPointerCapture(event.pointerId);
  } catch {
    // Synthetic or already-released pointers cannot be captured; the throw still works.
  }
  game.pointer(toWorld(event));
  game.press();
});
input.addEventListener('pointerup', (event) => {
  game.pointer(toWorld(event));
  game.release();
});
input.addEventListener('pointercancel', () => game.release());
input.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('resize', resize);

if (import.meta.env.DEV) {
  // Handle for automated play-tests in the dev server only. Not present in the built game.
  (window as unknown as { __game: typeof game }).__game = game;
}

let last = performance.now();
let lastInput = last;

/** Return the game and HUD to the attract screen. */
function resetToAttract(): void {
  game.reset();
  hud.showAttract(dailyTitle());
}

for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
  window.addEventListener(type, () => {
    lastInput = performance.now();
  }, true);
}
window.addEventListener('keydown', () => {
  lastInput = performance.now();
}, true);

const operator = createOperatorPanel({ resetToAttract, setMuted, isMuted });

window.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'o') {
    event.preventDefault();
    operator.toggle();
  } else {
    hud.key(event);
  }
});

function frame(now: number): void {
  // Clamp the step so a stalled tab does not fast-forward the round timer.
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (now - lastInput > 45_000 && ['intro', 'aim', 'flight', 'reveal', 'result'].includes(game.state.phase)) {
    resetToAttract();
  }
  // Dev-only test hook: automated screenshots freeze time and step the game themselves.
  const frozen = import.meta.env.DEV && (window as unknown as { __freeze?: boolean }).__freeze === true;
  if (!frozen) game.update(dt);
  if (!frozen && hud.tick(dt)) {
    game.reset();
    hud.showAttract(dailyTitle());
  }
  hud.frame(game.state);
  const st = game.state;
  updateMusic(st.phase, st.phase === 'aim' && st.charging ? Math.min(1, st.charge / Math.max(1, st.preview.length)) : 0);

  if (r3d) {
    r3d.render(game.state);
  } else {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    renderWorld(ctx, game.state);
  }
  requestAnimationFrame(frame);
}

resize();
hud.showAttract(dailyTitle());
registerServiceWorker();
requestAnimationFrame(frame);
