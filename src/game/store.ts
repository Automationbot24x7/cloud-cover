/**
 * Local leaderboard. Everything lives in this browser's localStorage, so a booth
 * laptop needs no network. A BroadcastChannel tells the second-screen board
 * (board.html, same machine) to refresh the moment a score is saved.
 */

export interface ScoreEntry {
  name: string;
  score: number;
  saved: number;
  squad: number;
  /** Milliseconds since epoch. */
  at: number;
}

const KEY = 'cloudcover.scores.v1';
const CHANNEL = 'cloudcover';
const MAX_ENTRIES = 500;

function safeParse(raw: string | null): ScoreEntry[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (e): e is ScoreEntry =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as ScoreEntry).name === 'string' &&
        typeof (e as ScoreEntry).score === 'number' &&
        typeof (e as ScoreEntry).at === 'number',
    );
  } catch {
    return [];
  }
}

/** Every saved score, best first. */
export function loadScores(): ScoreEntry[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  return safeParse(raw).sort((a, b) => b.score - a.score || a.at - b.at);
}

/** True when `at` falls on the same local calendar day as `now`. */
function sameDay(at: number, now: number): boolean {
  const a = new Date(at);
  const b = new Date(now);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Today's scores, best first. */
export function loadToday(now = Date.now()): ScoreEntry[] {
  return loadScores().filter((e) => sameDay(e.at, now));
}

/** Save a score and return its 1-based rank on today's board. */
export function saveScore(entry: ScoreEntry): number {
  const all = loadScores();
  all.push(entry);
  all.sort((a, b) => b.score - a.score || a.at - b.at);
  const trimmed = all.slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    // Storage full or blocked: the run still ends cleanly, the score is just not kept.
  }
  notify();
  return loadToday(entry.at).findIndex((e) => e.at === entry.at && e.name === entry.name) + 1;
}

/** Remove every saved score. Operator action. */
export function clearScores(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
  notify();
}

function notify(): void {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ type: 'scores-changed' });
    channel.close();
  } catch {
    // Older browsers: the board also listens to the storage event.
  }
}

/** Run `handler` whenever the scores change in any window on this machine. Returns an unsubscribe function. */
export function onScoresChanged(handler: () => void): () => void {
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = () => handler();
  } catch {
    channel = null;
  }
  const onStorage = (e: StorageEvent): void => {
    if (e.key === KEY || e.key === null) handler();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    channel?.close();
    window.removeEventListener('storage', onStorage);
  };
}
