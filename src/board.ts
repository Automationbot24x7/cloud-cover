import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/barlow-condensed/800-italic.css';
import '@fontsource/barlow/500.css';
import './style.css';
import './board.css';

import { loadToday, onScoresChanged } from './game/store';

const ROWS = 10;
const list = document.getElementById('board') as HTMLOListElement;
const foot = document.getElementById('board-foot') as HTMLElement;
let newest = 0;

/** Redraw the board from local storage. The newest entry flashes once. */
function paint(): void {
  const entries = loadToday();
  const latest = entries.reduce((max, e) => Math.max(max, e.at), 0);
  list.replaceChildren();
  for (let i = 0; i < ROWS; i++) {
    const entry = entries[i];
    const li = document.createElement('li');
    const pos = document.createElement('span');
    pos.className = 'pos';
    pos.textContent = String(i + 1);
    const name = document.createElement('span');
    const score = document.createElement('span');
    if (entry) {
      name.textContent = entry.name;
      score.textContent = entry.score.toLocaleString('en-US');
      if (entry.at === latest && latest !== newest) li.classList.add('me');
    } else {
      li.classList.add('empty');
      name.textContent = '---';
    }
    li.append(pos, name, score);
    list.append(li);
  }
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
