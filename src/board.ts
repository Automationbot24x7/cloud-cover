import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/barlow-condensed/800-italic.css';
import '@fontsource/barlow/500.css';
import './style.css';
import './board.css';

import { LEVELS } from './game/levels';
import { dayKey, mapOfTheDay } from './game/run';
import { renderBoardRows } from './game/boardRows';
import { loadToday, onScoresChanged } from './game/store';
import {
  initialLiveView,
  onLive,
  onLiveSnapshot,
  reduceLive,
  requestLiveSnapshot,
  type LiveMessage,
  type LiveView,
} from './game/live';
import { drawSpectator } from './game/spectator';

const ROWS = 10;
const list = document.getElementById('board') as HTMLOListElement;
const foot = document.getElementById('board-foot') as HTMLElement;
const canvas = document.getElementById('live-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
const attractCard = document.getElementById('attract-card') as HTMLElement;
const dailyMap = document.getElementById('daily-map') as HTMLElement;
const liveRound = document.getElementById('live-round') as HTMLElement;
const liveMap = document.getElementById('live-map') as HTMLElement;
const liveStatus = document.getElementById('live-status') as HTMLElement;
const liveTotal = document.getElementById('live-total') as HTMLElement;
const liveHidden = document.getElementById('live-hidden') as HTMLElement;
const livePercent = document.getElementById('live-percent') as HTMLElement;
const liveResult = document.getElementById('live-result') as HTMLElement;
const resultGrade = document.getElementById('result-grade') as HTMLElement;
const resultSafe = document.getElementById('result-safe') as HTMLElement;
const resultPoints = document.getElementById('result-points') as HTMLElement;
const liveSummary = document.getElementById('live-summary') as HTMLElement;
let newest = 0;
let view = initialLiveView();
let animationFrame: number | undefined;
let expiryTimer: number | undefined;

/** Redraw the board from local storage. The newest entry flashes once. */
function paintScores(): void {
  const entries = loadToday();
  const latest = entries.reduce((max, e) => Math.max(max, e.at), 0);
  renderBoardRows(list, entries, ROWS, latest !== newest ? latest : undefined);
  newest = latest;
  foot.textContent = entries.length
    ? `${entries.length} run${entries.length === 1 ? '' : 's'} today`
    : 'Waiting for the first run';
}

/** Redraws the attract card using today's map. */
function paintAttract(): void {
  dailyMap.textContent = mapOfTheDay(LEVELS, dayKey()).title;
}

/** Cancels the live map animation when there is no active run. */
function stopAnimation(): void {
  if (animationFrame === undefined) return;
  window.cancelAnimationFrame(animationFrame);
  animationFrame = undefined;
}

/** Returns the board to its idle attract card and stops live map work. */
function showAttract(): void {
  stopAnimation();
  if (expiryTimer !== undefined) window.clearTimeout(expiryTimer);
  expiryTimer = undefined;
  view = initialLiveView(Date.now());
  attractCard.hidden = false;
  liveRound.textContent = 'WAITING FOR THE NEXT RUN';
  liveMap.textContent = '';
  liveStatus.textContent = 'NEXT UP';
  liveTotal.textContent = '0';
  // No score panel while nobody is playing: "TOTAL SCORE 0" beside "WAITING" reads as broken.
  (liveTotal.parentElement as HTMLElement).hidden = true;
  liveHidden.hidden = true;
  liveResult.hidden = true;
  liveSummary.hidden = true;
  paintAttract();
}

/** Draws the live arena until a message arrives or the feed expires. */
function drawLive(clock: number): void {
  animationFrame = undefined;
  if (view.status === 'idle') return;
  if (Date.now() - view.at >= 20_000) {
    showAttract();
    return;
  }
  const level = LEVELS.find((candidate) => candidate.id === view.levelId);
  if (!level) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  drawSpectator(ctx, level, view, clock / 1000);
  animationFrame = window.requestAnimationFrame(drawLive);
}

/** Starts the map animation once while a live view is active. */
function startAnimation(): void {
  if (animationFrame !== undefined || view.status === 'idle') return;
  animationFrame = window.requestAnimationFrame(drawLive);
}

/** Schedules the idle transition without polling while the game window is closed. */
function scheduleExpiry(): void {
  if (expiryTimer !== undefined || view.status === 'idle') return;
  const delay = Math.max(0, view.at + 20_000 - Date.now());
  expiryTimer = window.setTimeout(() => {
    expiryTimer = undefined;
    if (Date.now() - view.at >= 20_000) showAttract();
    else scheduleExpiry();
  }, delay);
}

/** Displays the current live view and its result or charge details. */
function paintLive(): void {
  const level = LEVELS.find((candidate) => candidate.id === view.levelId);
  attractCard.hidden = true;
  liveRound.textContent = view.roundTotal > 0 && view.roundIndex === view.roundTotal - 1
    ? 'MAP OF THE DAY'
    : view.roundTotal > 0 && view.roundIndex !== null ? `ROUND ${view.roundIndex + 1} OF ${view.roundTotal}` : 'LIVE RUN';
  liveMap.textContent = level?.title ?? '';
  liveStatus.textContent = view.status === 'aiming' ? 'AIMING' : view.status === 'flying' ? 'IN FLIGHT' :
    view.status === 'result' ? 'ROUND RESULT' : 'RUN COMPLETE';
  liveTotal.textContent = view.totalScore.toLocaleString('en-US');
  (liveTotal.parentElement as HTMLElement).hidden = false;

  const showPercent = view.status === 'aiming' && view.charging && view.ratio !== null;
  liveHidden.hidden = !showPercent;
  if (showPercent && view.ratio !== null) {
    livePercent.textContent = `${Math.round(view.ratio * 100)}%`;
    const grade = view.ratio >= 0.97 ? 3 : view.ratio >= 0.7 ? 2 : view.ratio >= 0.35 ? 1 : 0;
    livePercent.dataset.grade = String(grade);
  }

  const result = view.lastResult;
  const showResult = (view.status === 'result' || view.status === 'summary') && result !== null;
  liveResult.hidden = !showResult;
  if (showResult && result) {
    const grades = ['EXPOSED', 'THIN COVER', 'COVERED', 'PERFECT COVER'];
    resultGrade.textContent = grades[result.grade];
    resultGrade.dataset.grade = String(result.grade);
    resultSafe.textContent = `${result.saved}/5 SAFE`;
    resultPoints.textContent = `+${result.points.toLocaleString('en-US')} POINTS`;
  }
  liveSummary.hidden = view.status !== 'summary';
  if (view.status === 'summary') liveSummary.textContent = `${view.saved}/${view.squad} SAFE THIS RUN`;
  startAnimation();
  scheduleExpiry();
}

/** Applies a message using its receipt time so the board can expire a stale game window. */
function receiveLive(message: LiveMessage): void {
  view = reduceLive(view, message, Date.now());
  if (view.status === 'idle') {
    showAttract();
    return;
  }
  paintLive();
}

/** Applies a synchronization snapshot using the board's receipt time. */
function receiveSnapshot(snapshot: LiveView): void {
  view = { ...snapshot, at: Date.now() };
  if (view.status === 'idle') {
    showAttract();
    return;
  }
  paintLive();
}

function fit(): void {
  const unit = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
  document.documentElement.style.setProperty('--u', `${unit}px`);
}

window.addEventListener('resize', fit);
onScoresChanged(paintScores);
// Belt and braces for a long booth day: repaint every 30 s so the date rollover is picked up.
window.setInterval(() => {
  paintScores();
  paintAttract();
}, 30_000);
fit();
showAttract();
paintScores();
onLive(receiveLive);
onLiveSnapshot(receiveSnapshot);
requestLiveSnapshot();
