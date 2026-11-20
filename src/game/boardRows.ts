import type { ScoreEntry } from './store';

/** Render leaderboard rows, optionally highlighting entries at a given timestamp. */
export function renderBoardRows(list: HTMLElement, entries: ScoreEntry[], rows: number, highlightAt?: number): void {
  list.replaceChildren();
  for (let i = 0; i < rows; i++) {
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
      if (highlightAt !== undefined && entry.at === highlightAt) li.classList.add('me');
    } else {
      li.classList.add('empty');
      name.textContent = '---';
      score.textContent = '';
    }
    li.append(pos, name, score);
    list.append(li);
  }
}