import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearToday,
  loadScores,
  loadToday,
  saveScore,
  scoresToCsv,
  todayStats,
  type ScoreEntry,
} from '../src/game/store';

const KEY = 'cloudcover.scores.v1';
const today = new Date(2026, 0, 2, 12, 0).getTime();
const yesterday = new Date(2026, 0, 1, 23, 59).getTime();
let postMessage: ReturnType<typeof vi.fn>;

/** Returns a score entry with the given tag, score and timestamp. */
function entry(name: string, score: number, at = today): ScoreEntry {
  return { name, score, saved: 3, squad: 5, at };
}

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
    clear: () => data.clear(),
  });
  postMessage = vi.fn();
  vi.stubGlobal('BroadcastChannel', class {
    onmessage = null;
    postMessage = postMessage;
    close(): void {}
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('store', () => {
  it('loads scores best first, breaking ties by earlier time', () => {
    const later = entry('later', 20, today + 1000);
    const earlier = entry('earlier', 20, today);
    const low = entry('low', 10);
    saveScore(later);
    saveScore(low);
    saveScore(earlier);
    expect(loadScores()).toEqual([earlier, later, low]);
  });

  it('loads only entries from the requested local day', () => {
    const old = entry('old', 100, yesterday);
    const current = entry('current', 10);
    saveScore(old);
    saveScore(current);
    expect(loadToday(today)).toEqual([current]);
    vi.spyOn(Date, 'now').mockReturnValue(today);
    expect(loadToday()).toEqual([current]);
  });

  it('returns the 1-based rank among scores on the entry day', () => {
    saveScore(entry('old', 100, yesterday));
    expect(saveScore(entry('first', 20))).toBe(1);
    expect(saveScore(entry('second', 10))).toBe(2);
    expect(saveScore(entry('new first', 30))).toBe(1);
  });

  it('loads corrupt JSON as an empty list', () => {
    localStorage.setItem(KEY, '{broken');
    expect(loadScores()).toEqual([]);
    localStorage.setItem(KEY, '{}');
    expect(loadScores()).toEqual([]);
  });

  it('clears only the requested day and notifies listeners', () => {
    const old = entry('old', 10, yesterday);
    const future = entry('future', 20, new Date(2026, 0, 3, 0, 0).getTime());
    saveScore(old);
    saveScore(entry('one', 30));
    saveScore(entry('two', 40, today + 1000));
    saveScore(future);
    postMessage.mockClear();
    expect(clearToday(today)).toBe(2);
    expect(loadScores()).toEqual([future, old]);
    expect(postMessage).toHaveBeenCalledWith({ type: 'scores-changed' });
    vi.spyOn(Date, 'now').mockReturnValue(today);
    expect(clearToday()).toBe(0);
    expect(loadScores()).toEqual([future, old]);
  });

  it('reports no removals when storage rejects the clear', () => {
    const current = entry('current', 10);
    saveScore(current);
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    postMessage.mockClear();
    expect(clearToday(today)).toBe(0);
    expect(loadScores()).toEqual([current]);
    expect(postMessage).toHaveBeenCalledWith({ type: 'scores-changed' });
  });

  it('formats local dates and times as CSV with escaped fields and CRLF rows', () => {
    const entries = [
      entry('plain', 12, new Date(2026, 0, 2, 3, 4).getTime()),
      entry('A,"B"', 34, new Date(2026, 10, 12, 13, 14).getTime()),
      entry('two\nlines', 56),
    ];
    expect(scoresToCsv(entries)).toBe(
      'date,time,tag,score,saved,squad\r\n' +
      '2026-01-02,03:04,plain,12,3,5\r\n' +
      '2026-11-12,13:14,"A,""B""",34,3,5\r\n' +
      '2026-01-02,12:00,"two\nlines",56,3,5',
    );
    expect(scoresToCsv([])).toBe('date,time,tag,score,saved,squad');
    expect(entries[1].name).toBe('A,"B"');
  });

  it('returns zero statistics for no runs and rounded statistics for today', () => {
    expect(todayStats(today)).toEqual({ runs: 0, best: 0, average: 0 });
    saveScore(entry('old', 1000, yesterday));
    saveScore(entry('one', 10));
    saveScore(entry('two', 20));
    saveScore(entry('three', 26));
    expect(todayStats(today)).toEqual({ runs: 3, best: 26, average: 19 });
    vi.spyOn(Date, 'now').mockReturnValue(today);
    expect(todayStats()).toEqual({ runs: 3, best: 26, average: 19 });
  });

  it('caps the list at 500 entries, retaining the best', () => {
    const entries = Array.from({ length: 500 }, (_, score) => entry(`player${score}`, score));
    localStorage.setItem(KEY, JSON.stringify(entries));
    expect(saveScore(entry('too low', -1))).toBe(0);
    expect(loadScores()).toHaveLength(500);
    expect(saveScore(entry('new best', 1000))).toBe(1);
    const scores = loadScores();
    expect(scores).toHaveLength(500);
    expect(scores[0].name).toBe('new best');
    expect(scores[499].score).toBe(1);
  });
});