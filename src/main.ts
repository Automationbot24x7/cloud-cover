import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/barlow-condensed/800-italic.css';
import '@fontsource/barlow/500.css';
import './style.css';

import type { Vec } from './core/types';
import { unlock } from './game/audio';
import { createGame } from './game/game';
import { createHud } from './game/hud';
import { WORLD } from './game/levels';
import { renderWorld } from './game/render';

const canvas = document.getElementById('world') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

let scale = 1;

/** Fit the 16:9 stage to the window and match the canvas backing store to the screen. */
function resize(): void {
  const unit = Math.min(window.innerWidth / WORLD.w, window.innerHeight / WORLD.h);
  document.documentElement.style.setProperty('--u', `${unit}px`);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  scale = unit * dpr;
  canvas.width = Math.round(WORLD.w * scale);
  canvas.height = Math.round(WORLD.h * scale);
}

function toWorld(event: PointerEvent): Vec {
  const box = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - box.left) / box.width) * WORLD.w,
    y: ((event.clientY - box.top) / box.height) * WORLD.h,
  };
}

const game = createGame({
  onRound: (index, level) => hud.showRound(index, level, game.totalRounds),
  onAim: () => hud.showAim(),
  onThrow: () => hud.showThrow(),
  onResult: (result) => hud.showResult(result, game.state.roundIndex),
  onSummary: (results, score) => hud.showSummary(results, score),
});

const hud = createHud(
  {
    play: () => {
      unlock();
      hud.hideAttract();
      game.start();
    },
    reset: () => game.reset(),
  },
  game.totalRounds,
);

canvas.addEventListener('pointermove', (event) => game.pointer(toWorld(event)));
canvas.addEventListener('pointerdown', (event) => {
  unlock();
  try {
    // Keep receiving the release even if the pointer leaves the canvas mid-charge.
    canvas.setPointerCapture(event.pointerId);
  } catch {
    // Synthetic or already-released pointers cannot be captured; the throw still works.
  }
  game.pointer(toWorld(event));
  game.press();
});
canvas.addEventListener('pointerup', (event) => {
  game.pointer(toWorld(event));
  game.release();
});
canvas.addEventListener('pointercancel', () => game.release());
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('keydown', (event) => hud.key(event));
window.addEventListener('resize', resize);

if (import.meta.env.DEV) {
  // Handle for automated play-tests in the dev server only. Not present in the built game.
  (window as unknown as { __game: typeof game }).__game = game;
}

let last = performance.now();

function frame(now: number): void {
  // Clamp the step so a stalled tab does not fast-forward the round timer.
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  game.update(dt);
  if (hud.tick(dt)) {
    game.reset();
    hud.showAttract();
  }
  hud.frame(game.state);

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  renderWorld(ctx, game.state);
  requestAnimationFrame(frame);
}

resize();
hud.showAttract();
requestAnimationFrame(frame);
