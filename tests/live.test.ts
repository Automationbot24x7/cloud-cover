import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialLiveView, reduceLive, type LiveMessage } from '../src/game/live';

describe('live view reducer', () => {
  it('reduces a full run while keeping cumulative score and saved runners', () => {
    let view = initialLiveView();
    const messages: LiveMessage[] = [
      { type: 'round', index: 0, total: 2, levelId: 'open-gap' },
      { type: 'aim', marker: { x: 700, y: 400 }, charging: true, ratio: 0.72 },
      { type: 'flight', marker: { x: 600, y: 350 } },
      { type: 'cloud', center: { x: 800, y: 400 }, radius: 85 },
      { type: 'result', ratio: 0.72, grade: 2, saved: 4, points: 610, score: 610 },
      { type: 'round', index: 1, total: 2, levelId: 'doorway' },
      { type: 'aim', marker: { x: 950, y: 430 }, charging: true, ratio: 0.98 },
      { type: 'cloud', center: { x: 980, y: 440 }, radius: 100 },
      { type: 'result', ratio: 0.98, grade: 3, saved: 5, points: 900, score: 1510 },
      { type: 'summary', score: 1510, saved: 9, squad: 10 },
    ];
    messages.forEach((message, index) => {
      view = reduceLive(view, message, (index + 1) * 100);
    });

    expect(view).toMatchObject({
      status: 'summary',
      roundIndex: 1,
      roundTotal: 2,
      levelId: 'doorway',
      totalScore: 1510,
      saved: 9,
      squad: 10,
      at: 1000,
      lastResult: { ratio: 0.98, grade: 3, saved: 5, points: 900, score: 1510 },
    });
  });

  it('clears the previous cloud and result when a round starts', () => {
    const afterResult = reduceLive(
      reduceLive(
        reduceLive(initialLiveView(), { type: 'round', index: 0, total: 2, levelId: 'open-gap' }, 1),
        { type: 'cloud', center: { x: 800, y: 400 }, radius: 85 },
        2,
      ),
      { type: 'result', ratio: 0.5, grade: 1, saved: 3, points: 400, score: 400 },
      3,
    );

    const nextRound = reduceLive(afterResult, { type: 'round', index: 1, total: 2, levelId: 'doorway' }, 4);

    expect(nextRound).toMatchObject({
      status: 'aiming',
      roundIndex: 1,
      levelId: 'doorway',
      cloud: null,
      lastResult: null,
      totalScore: 400,
      saved: 3,
    });
  });

  it('resets every run field on idle', () => {
    const active = reduceLive(
      reduceLive(initialLiveView(), { type: 'round', index: 2, total: 6, levelId: 'side-pocket' }, 10),
      { type: 'aim', marker: { x: 500, y: 300 }, charging: true, ratio: 0.4 },
      11,
    );

    expect(reduceLive(active, { type: 'idle' }, 12)).toEqual(initialLiveView(12));
  });

  it('clears previous totals when a new run starts at round zero', () => {
    const afterRun = reduceLive(
      reduceLive(initialLiveView(), { type: 'result', ratio: 0.8, grade: 2, saved: 4, points: 600, score: 600 }, 1),
      { type: 'summary', score: 600, saved: 4, squad: 5 },
      2,
    );

    expect(reduceLive(afterRun, { type: 'round', index: 0, total: 3, levelId: 'open-gap' }, 3)).toMatchObject({
      totalScore: 0,
      saved: 0,
      squad: 0,
      cloud: null,
      lastResult: null,
    });
  });

  it('keeps charging ratio only with the aim message and uses the caller time', () => {
    const round = reduceLive(initialLiveView(), { type: 'round', index: 0, total: 1, levelId: 'open-gap' }, 20);
    const aiming = reduceLive(round, { type: 'aim', marker: { x: 10, y: 20 }, charging: false, ratio: null }, 25);
    const charging = reduceLive(aiming, { type: 'aim', marker: { x: 30, y: 40 }, charging: true, ratio: 0.61 }, 30);

    expect(aiming).toMatchObject({ charging: false, ratio: null, at: 25 });
    expect(charging).toMatchObject({ charging: true, ratio: 0.61, marker: { x: 30, y: 40 }, at: 30 });
  });

  it('does not mutate the input view or nested marker', () => {
    const view = reduceLive(initialLiveView(), { type: 'round', index: 0, total: 1, levelId: 'open-gap' }, 1);
    const marker = { x: 25, y: 50 };
    const next = reduceLive(view, { type: 'aim', marker, charging: true, ratio: 0.3 }, 2);

    expect(view.marker).toBeNull();
    expect(view.status).toBe('aiming');
    expect(next.marker).not.toBe(marker);
    expect(next.marker).toEqual(marker);
  });
});

describe('live broadcast', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('delivers live messages without exposing snapshot controls to the game feed', async () => {
    vi.resetModules();
    const sent: unknown[] = [];
    let dispatch: ((data: unknown) => void) | undefined;
    vi.stubGlobal('BroadcastChannel', class {
      addEventListener(_type: string, listener: (event: MessageEvent<unknown>) => void): void {
        dispatch = (data) => listener(new MessageEvent('message', { data }));
      }
      removeEventListener(): void { dispatch = undefined; }
      postMessage(message: unknown): void { sent.push(message); }
    });
    const { onLive, publishLive } = await import('../src/game/live');
    const received: LiveMessage[] = [];
    const unsubscribe = onLive((message) => received.push(message));
    publishLive({ type: 'round', index: 0, total: 1, levelId: 'open-gap' });
    dispatch?.({ type: 'idle' });
    dispatch?.({ control: 'snapshot-request' });

    expect(sent).toEqual([{ type: 'round', index: 0, total: 1, levelId: 'open-gap' }]);
    expect(received).toEqual([{ type: 'idle' }]);
    unsubscribe();
  });

  it('requests and receives a late-joining board snapshot', async () => {
    vi.resetModules();
    const sent: unknown[] = [];
    const listeners = new Set<(event: MessageEvent<unknown>) => void>();
    vi.stubGlobal('BroadcastChannel', class {
      addEventListener(_type: string, listener: (event: MessageEvent<unknown>) => void): void {
        listeners.add(listener);
      }
      removeEventListener(_type: string, listener: (event: MessageEvent<unknown>) => void): void {
        listeners.delete(listener);
      }
      postMessage(message: unknown): void { sent.push(message); }
    });
    const live = await import('../src/game/live');
    const view = reduceLive(initialLiveView(), { type: 'round', index: 0, total: 1, levelId: 'open-gap' }, 1);
    const received: ReturnType<typeof initialLiveView>[] = [];
    const unsubscribeSnapshot = live.onLiveSnapshot((snapshot) => received.push(snapshot));
    const unsubscribeRequest = live.onLiveSnapshotRequest(() => live.publishLiveSnapshot(view));

    live.requestLiveSnapshot();
    listeners.forEach((listener) => listener(new MessageEvent('message', { data: { control: 'snapshot-request' } })));
    listeners.forEach((listener) => listener(new MessageEvent('message', { data: sent[1] })));

    expect(sent).toEqual([{ control: 'snapshot-request' }, { control: 'snapshot-state', view }]);
    expect(received).toEqual([view]);
    unsubscribeSnapshot();
    unsubscribeRequest();
  });


  it('keeps publishing and subscribing safe when BroadcastChannel is unavailable', async () => {
    vi.resetModules();
    vi.stubGlobal('BroadcastChannel', undefined);
    const live = await import('../src/game/live');
    const unsubscribe = live.onLive(() => undefined);

    expect(() => live.publishLive({ type: 'idle' })).not.toThrow();
    expect(() => live.requestLiveSnapshot()).not.toThrow();
    expect(() => live.publishLiveSnapshot(initialLiveView())).not.toThrow();
    unsubscribe();
  });
});