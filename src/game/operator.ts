import { clearToday, loadToday, onScoresChanged, scoresToCsv, todayStats } from './store';

interface OperatorActions {
  resetToAttract(): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  /** Which renderer is drawing: full 3D or the flat safe mode. */
  graphics(): '3d' | 'safe';
  toggleGraphics(): void;
}

/** Returns a DOM element with the given class and text. */
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

/** Returns an operator button. */
function button(text: string): HTMLButtonElement {
  const node = element('button', 'operator-button', text);
  node.type = 'button';
  return node;
}

/** Returns a local date formatted for the download filename. */
function dateForFilename(now: number): string {
  const date = new Date(now);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Returns the controls for a hidden booth operator panel. */
export function createOperatorPanel(actions: OperatorActions): { toggle(): void; isOpen(): boolean } {
  const stage = document.getElementById('stage');
  if (!stage) throw new Error('Missing element #stage');
  const host: HTMLElement = stage;
  const backdrop = element('div', 'operator-backdrop');
  backdrop.hidden = true;
  const panel = element('section', 'operator-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Operator');
  const title = element('h2', 'operator-title', 'OPERATOR');
  const stats = element('div', 'operator-stats');
  const runs = element('div', 'operator-stat');
  const best = element('div', 'operator-stat');
  const average = element('div', 'operator-stat');
  const reset = button('Reset to title');
  const board = button('Open leaderboard window');
  const note = element('p', 'operator-note', 'Drag it to the second screen and press F11');
  const sound = button('');
  const graphics = button('');
  const download = button("Download today's scores (CSV)");
  const clear = button("Clear today's board");
  clear.classList.add('operator-danger');
  stats.append(runs, best, average);
  panel.append(title, stats, reset, board, note, sound, graphics, download, clear);
  backdrop.append(panel);
  stage.append(backdrop);

  let clearDeadline = 0;
  let clearTimer: number | undefined;
  const canvasPointers = new Set<number>();

  /** Returns the panel's current statistics in its display. */
  function refreshStats(): void {
    const current = todayStats();
    runs.textContent = `RUNS  ${current.runs.toLocaleString('en-US')}`;
    best.textContent = `BEST  ${current.best.toLocaleString('en-US')}`;
    average.textContent = `AVERAGE  ${current.average.toLocaleString('en-US')}`;
  }

  /** Returns the sound button to the current audio state. */
  function refreshSound(): void {
    sound.textContent = actions.isMuted() ? 'Sound off' : 'Sound on';
    sound.setAttribute('aria-pressed', String(!actions.isMuted()));
  }

  /** Returns the graphics button to the renderer in use. */
  function refreshGraphics(): void {
    graphics.textContent = actions.graphics() === '3d' ? 'Graphics: 3D (switch to safe mode)' : 'Graphics: safe mode (switch to 3D)';
  }

  /** Returns the clear button to its unconfirmed state. */
  function resetClear(): void {
    clearDeadline = 0;
    window.clearTimeout(clearTimer);
    clearTimer = undefined;
    clear.textContent = "Clear today's board";
  }

  /** Returns the panel to its closed state. */
  function close(): void {
    backdrop.hidden = true;
    resetClear();
  }

  /** Returns captured canvas pointers to their normal cancelled state. */
  function cancelCanvasPointers(): void {
    const canvas = [...host.querySelectorAll('canvas')].find((c) => c.style.display !== 'none');
    if (!canvas) return;
    for (const pointerId of canvasPointers) {
      canvas.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId }));
      if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    }
    canvasPointers.clear();
  }

  reset.addEventListener('click', () => {
    actions.resetToAttract();
    close();
  });
  board.addEventListener('click', () => window.open('board.html', 'cloudcover-board'));
  sound.addEventListener('click', () => {
    actions.setMuted(!actions.isMuted());
    refreshSound();
  });
  graphics.addEventListener('click', () => {
    actions.toggleGraphics();
    refreshGraphics();
  });
  download.addEventListener('click', () => {
    const now = Date.now();
    const csv = scoresToCsv(loadToday(now));
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `cloud-cover-scores-${dateForFilename(now)}.csv`;
    stage.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  });
  clear.addEventListener('click', () => {
    const now = Date.now();
    if (clearDeadline && now <= clearDeadline) {
      clearToday(now);
      resetClear();
      refreshStats();
      return;
    }
    resetClear();
    clearDeadline = now + 3000;
    clear.textContent = 'Click again to clear';
    clearTimer = window.setTimeout(resetClear, 3000);
  });

  onScoresChanged(refreshStats);
  window.addEventListener('keydown', (event) => {
    if (!backdrop.hidden && event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    }
  }, true);
  window.addEventListener('pointerdown', (event) => {
    if (event.target instanceof HTMLCanvasElement) canvasPointers.add(event.pointerId);
  }, true);
  for (const type of ['pointerup', 'pointercancel'] as const) {
    window.addEventListener(type, (event) => canvasPointers.delete(event.pointerId), true);
  }
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const) {
    window.addEventListener(type, (event) => {
      if (!backdrop.hidden && event.target instanceof HTMLCanvasElement) event.stopImmediatePropagation();
    }, true);
  }

  return {
    toggle() {
      if (!backdrop.hidden) {
        close();
        return;
      }
      cancelCanvasPointers();
      refreshStats();
      refreshSound();
      refreshGraphics();
      backdrop.hidden = false;
      reset.focus();
    },
    isOpen() {
      return !backdrop.hidden;
    },
  };
}