import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/barlow-condensed/800-italic.css';
import '@fontsource/barlow/500.css';
import './style.css';
import './board.css';

import { renderBoardRows } from './game/boardRows';
import { loadToday, onScoresChanged } from './game/store';

const ROWS = 10;
const list = document.getElementById('board') as HTMLOListElement;
const foot = document.getElementById('board-foot') as HTMLElement;
let newest = 0;

/** Redraw the board from local storage. The newest entry flashes once. */
function paint(): void {
  const entries = loadToday();
  const latest = entries.reduce((max, e) => Math.max(max, e.at), 0);
  renderBoardRows(list, entries, ROWS, latest !== newest ? latest : undefined);
  newest = latest;
  foot.textContent = entries.length
    ? `${entries.length} run${entries.length === 1 ? '' : 's'} today`
    : 'Waiting for the first run';
}

function fit(): void {
  const unit = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
  document.documentElement.style.setProperty('--u', `${unit}px`);
}

window.addEventListener('resize', fit);
onScoresChanged(paint);
// Belt and braces for a long booth day: repaint every 30 s so the date rollover is picked up.
window.setInterval(paint, 30_000);
fit();
paint();
