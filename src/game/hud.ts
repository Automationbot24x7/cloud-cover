import { sfx } from './audio';
import { renderBoardRows } from './boardRows';
import { GRADE_LABEL } from './game';
import type { Level } from './levels';
import { squadPoses } from './squad';
import { SQUAD_SIZE, TIMING, type GameState, type Grade, type RoundResult } from './state';
import { loadToday, saveScore } from './store';

const GRADE_COLOR: Record<Grade, string> = {
  0: 'var(--coral)',
  1: 'var(--amber)',
  2: 'var(--blue)',
  3: 'var(--mint)',
};

const TAG_LENGTH = 3;
/** Seconds the name-entry screen waits before giving the booth back to the next fan. */
const ENTRY_IDLE = 45;
/** Seconds the saved-score screen stays up. */
const SAVED_IDLE = 12;

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

/** Title a fan earns from the share of the squad they saved. */
export function rankFor(saved: number, squad: number): string {
  const share = squad > 0 ? saved / squad : 0;
  if (share >= 0.93) return 'CLOUD NINE';
  if (share >= 0.75) return 'SMOKE PRO';
  if (share >= 0.5) return 'COVER CADET';
  return 'FRESH RECRUIT';
}

export interface Hud {
  /** Per-frame refresh of the numbers that animate. */
  frame(state: GameState): void;
  /** Flash "TIME'S UP" when the round timer runs out. */
  showTimeUp(): void;
  /** Show the title screen. `dailyTitle` names today's final map. */
  showAttract(dailyTitle?: string): void;
  hideAttract(): void;
  showRound(index: number, level: Level, total: number): void;
  showAim(): void;
  showThrow(): void;
  showResult(result: RoundResult, index: number): void;
  showSummary(results: RoundResult[], score: number): void;
  /** Advance idle timers. Returns true when the HUD wants the game reset to attract. */
  tick(dt: number): boolean;
  /** Feed a key press to the name entry, if it is open. */
  key(event: KeyboardEvent): void;
  /** True while the summary screen is up. */
  inSummary(): boolean;
}

export interface HudActions {
  play(): void;
  reset(): void;
}

export function createHud(actions: HudActions, totalRounds: number): Hud {
  const pips = el<HTMLDivElement>('pips');
  const roundTitle = el<HTMLDivElement>('round-title');
  const score = el<HTMLSpanElement>('score');
  const timerFill = el<HTMLDivElement>('timer-fill');
  const hint = el<HTMLDivElement>('hint');
  const banner = el<HTMLDivElement>('banner');
  const toast = el<HTMLDivElement>('toast');
  const attract = el<HTMLElement>('attract');
  const summary = el<HTMLElement>('summary');
  const entry = el<HTMLDivElement>('entry');
  const saved = el<HTMLDivElement>('saved');
  const slots = el<HTMLDivElement>('entry-slots');
  const keys = el<HTMLDivElement>('entry-keys');
  const saveButton = el<HTMLButtonElement>('save');
  const idleFill = el<HTMLDivElement>('idle-fill');
  const entryIdleFill = el<HTMLDivElement>('entry-idle-fill');
  const timeUp = el<HTMLDivElement>('timeup');

  let tag = '';
  let finalScore = 0;
  let finalSaved = 0;
  let idle = 0;
  let idleLimit = 0;
  let wantsReset = false;

  for (let i = 0; i < totalRounds; i++) {
    const pip = document.createElement('div');
    pip.className = 'pip';
    pips.append(pip);
  }

  function restartAnimation(node: HTMLElement): void {
    node.hidden = false;
    node.style.animation = 'none';
    void node.offsetWidth;
    node.style.animation = '';
  }

  function paintSlots(): void {
    slots.replaceChildren();
    for (let i = 0; i < TAG_LENGTH; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot' + (i === tag.length ? ' now' : '');
      slot.textContent = tag[i] ?? '';
      slots.append(slot);
    }
    saveButton.disabled = tag.length < TAG_LENGTH;
  }

  function type(letter: string): void {
    if (tag.length >= TAG_LENGTH) return;
    tag += letter;
    idle = 0;
    sfx.ui();
    paintSlots();
  }

  function erase(): void {
    if (!tag.length) return;
    tag = tag.slice(0, -1);
    idle = 0;
    paintSlots();
  }

  function commit(): void {
    if (tag.length < TAG_LENGTH || entry.hidden) return;
    const at = Date.now();
    const rank = saveScore({ name: tag, score: finalScore, saved: finalSaved, squad: totalRounds * SQUAD_SIZE, at });
    sfx.start();
    entry.hidden = true;
    saved.hidden = false;
    el('saved-rank').textContent = rank > 0 ? `#${rank} TODAY` : 'SAVED';
    renderBoardRows(el('summary-board'), loadToday(), 5, at);
    idle = 0;
    idleLimit = SAVED_IDLE;
  }

  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const key = document.createElement('button');
    key.type = 'button';
    key.className = 'key';
    key.textContent = letter;
    key.addEventListener('click', () => type(letter));
    keys.append(key);
  }
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'key wide';
  back.textContent = 'DEL';
  back.addEventListener('click', erase);
  keys.append(back);

  saveButton.addEventListener('click', commit);
  el('again').addEventListener('click', () => {
    sfx.ui();
    wantsReset = true;
  });
  attract.addEventListener('click', () => actions.play());

  return {
    frame(state) {
      score.textContent = Math.round(state.shownScore).toLocaleString('en-US');
      // Squad tally: one icon per runner, filled safe or spotted as each one finishes.
      const tally = el('tally');
      const running = (state.phase === 'reveal' && state.phaseTime >= TIMING.runStart - 0.2) || state.phase === 'result';
      tally.hidden = !running;
      if (running) {
        const poses = squadPoses(state);
        const icons = el('tally-icons').children;
        let safe = 0;
        let done = 0;
        poses.forEach((p, i) => {
          const icon = icons[i] as HTMLElement | undefined;
          if (!icon) return;
          const stateName = p.spotted ? 'spotted' : p.arrived ? 'safe' : '';
          icon.className = stateName;
          if (p.arrived) safe++;
          if (p.spotted || p.arrived) done++;
        });
        el('tally-label').textContent = done < poses.length ? 'SQUAD MOVING' : `${safe}/${poses.length} SAFE`;
        tally.dataset.result = done < poses.length ? '' : safe === poses.length ? 'all' : safe === 0 ? 'none' : 'some';
      }
      const share = state.phase === 'aim' ? Math.max(0, state.timeLeft / state.level.seconds) : state.phase === 'intro' ? 1 : 0;
      timerFill.style.transform = `scaleX(${share})`;
      timerFill.classList.toggle('low', state.phase === 'aim' && state.timeLeft <= 3);
    },

    showAttract(dailyTitle) {
      el('attract-daily').textContent = dailyTitle ? `Today's six maps end on: ${dailyTitle}` : '';
      summary.hidden = true;
      banner.hidden = true;
      toast.hidden = true;
      attract.hidden = false;
      hint.style.opacity = '0';
      roundTitle.textContent = '';
      pips.querySelectorAll('.pip').forEach((p) => (p.className = 'pip'));
      renderBoardRows(el('attract-board'), loadToday(), 5);
    },

    hideAttract() {
      attract.hidden = true;
    },

    showRound(index, level, total) {
      toast.hidden = true;
      el('banner-kicker').textContent = index === total - 1 ? 'FINAL ROUND: MAP OF THE DAY' : `ROUND ${index + 1} OF ${total}`;
      el('banner-title').textContent = level.title;
      el('banner-brief').textContent = level.brief;
      restartAnimation(banner);
      roundTitle.textContent = level.title;
      pips.querySelectorAll('.pip').forEach((p, i) => p.classList.toggle('now', i === index));
      hint.style.opacity = '0';
    },

    showTimeUp() {
      restartAnimation(timeUp);
    },

    showAim() {
      banner.hidden = true;
      hint.style.opacity = '1';
    },

    showThrow() {
      hint.style.opacity = '0';
    },

    showResult(result, index) {
      toast.style.setProperty('--grade', GRADE_COLOR[result.grade]);
      el('toast-grade').textContent = GRADE_LABEL[result.grade];
      el('toast-percent').textContent = `${Math.round(result.ratio * 100)}%`;
      el('toast-points').textContent = `+${result.points.toLocaleString('en-US')}`;
      const chips = el('toast-chips');
      chips.replaceChildren();
      if (result.styleBonus > 0) {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = result.bounces > 1 ? `${result.bounces}X BANK` : 'BANK SHOT';
        chips.append(chip);
      }
      if (result.timeBonus >= 120) {
        const chip = document.createElement('span');
        chip.className = 'chip speed';
        chip.textContent = 'QUICK';
        chips.append(chip);
      }
      restartAnimation(toast);
      const pip = pips.children[index];
      if (pip) pip.className = `pip g${result.grade}`;
    },

    showSummary(results, total) {
      toast.hidden = true;
      banner.hidden = true;
      hint.style.opacity = '0';
      finalScore = total;
      finalSaved = results.reduce((sum, r) => sum + r.saved, 0);
      const squad = results.length * SQUAD_SIZE;
      el('summary-rank').textContent = rankFor(finalSaved, squad);
      el('summary-score').textContent = total.toLocaleString('en-US');
      el('summary-saved').textContent = `${finalSaved}/${squad}`;
      const rounds = el('summary-rounds');
      rounds.replaceChildren();
      for (const r of results) {
        const pip = document.createElement('div');
        pip.className = `pip g${r.grade}`;
        rounds.append(pip);
      }
      tag = '';
      paintSlots();
      entry.hidden = false;
      saved.hidden = true;
      summary.hidden = false;
      idle = 0;
      idleLimit = ENTRY_IDLE;
      wantsReset = false;
    },

    tick(dt) {
      if (summary.hidden) return false;
      idle += dt;
      // Both name entry and the saved screen show how long until the booth resets for the next fan.
      const left = `scaleX(${Math.max(0, 1 - idle / idleLimit)})`;
      idleFill.style.transform = left;
      entryIdleFill.style.transform = left;
      if (idle >= idleLimit || wantsReset) {
        wantsReset = false;
        return true;
      }
      return false;
    },

    key(event) {
      if (summary.hidden || entry.hidden) return;
      if (/^[a-zA-Z]$/.test(event.key)) type(event.key.toUpperCase());
      else if (event.key === 'Backspace') erase();
      else if (event.key === 'Enter') commit();
    },

    inSummary() {
      return !summary.hidden;
    },
  };
}
