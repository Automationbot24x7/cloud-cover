import type { Cloud, Vec } from '../core/types';

export type LiveMessage =
  | { type: 'round'; index: number; total: number; levelId: string }
  | { type: 'aim'; marker: Vec; charging: boolean; ratio: number | null }
  | { type: 'flight'; marker: Vec }
  | { type: 'cloud'; center: Vec; radius: number }
  | { type: 'result'; ratio: number; grade: 0 | 1 | 2 | 3; saved: number; points: number; score: number }
  | { type: 'summary'; score: number; saved: number; squad: number }
  | { type: 'idle' };

export type LiveStatus = 'idle' | 'aiming' | 'flying' | 'result' | 'summary';

export interface LiveResult {
  ratio: number;
  grade: 0 | 1 | 2 | 3;
  saved: number;
  points: number;
  score: number;
}

export interface LiveView {
  status: LiveStatus;
  roundIndex: number | null;
  roundTotal: number;
  levelId: string | null;
  marker: Vec | null;
  charging: boolean;
  ratio: number | null;
  cloud: Cloud | null;
  lastResult: LiveResult | null;
  totalScore: number;
  saved: number;
  squad: number;
  at: number;
}

type LiveControlMessage =
  | { control: 'snapshot-request' }
  | { control: 'snapshot-state'; view: LiveView };

const CHANNEL_NAME = 'cloudcover-live';
let channel: BroadcastChannel | null | undefined;

/** Returns the shared channel, or null when the browser cannot provide one. */
function getChannel(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  try {
    channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME);
  } catch {
    channel = null;
  }
  return channel;
}

/** Returns whether a value has finite x and y coordinates. */
function isVec(value: unknown): value is Vec {
  if (typeof value !== 'object' || value === null) return false;
  const point = value as { x?: unknown; y?: unknown };
  return typeof point.x === 'number' && Number.isFinite(point.x) && typeof point.y === 'number' && Number.isFinite(point.y);
}

/** Returns whether a value is a supported game message. */
function isLiveMessage(value: unknown): value is LiveMessage {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Record<string, unknown>;
  switch (message.type) {
    case 'round':
      return Number.isInteger(message.index) && Number.isInteger(message.total) && typeof message.levelId === 'string';
    case 'aim':
      return isVec(message.marker) && typeof message.charging === 'boolean' &&
        (message.ratio === null || (typeof message.ratio === 'number' && Number.isFinite(message.ratio)));
    case 'flight':
      return isVec(message.marker);
    case 'cloud':
      return isVec(message.center) && typeof message.radius === 'number' && Number.isFinite(message.radius);
    case 'result':
      return typeof message.ratio === 'number' && Number.isFinite(message.ratio) &&
        (message.grade === 0 || message.grade === 1 || message.grade === 2 || message.grade === 3) &&
        typeof message.saved === 'number' && Number.isFinite(message.saved) &&
        typeof message.points === 'number' && Number.isFinite(message.points) &&
        typeof message.score === 'number' && Number.isFinite(message.score);
    case 'summary':
      return typeof message.score === 'number' && Number.isFinite(message.score) &&
        typeof message.saved === 'number' && Number.isFinite(message.saved) &&
        typeof message.squad === 'number' && Number.isFinite(message.squad);
    case 'idle':
      return true;
    default:
      return false;
  }
}

/** Returns whether a value has the fields required to restore a live view. */
function isLiveView(value: unknown): value is LiveView {
  if (typeof value !== 'object' || value === null) return false;
  const view = value as Partial<LiveView>;
  const result = view.lastResult;
  const validResult = result === null || (result !== undefined && typeof result === 'object' &&
    typeof result.ratio === 'number' && Number.isFinite(result.ratio) &&
    (result.grade === 0 || result.grade === 1 || result.grade === 2 || result.grade === 3) &&
    typeof result.saved === 'number' && Number.isFinite(result.saved) &&
    typeof result.points === 'number' && Number.isFinite(result.points) &&
    typeof result.score === 'number' && Number.isFinite(result.score));
  const cloud = view.cloud;
  return (view.status === 'idle' || view.status === 'aiming' || view.status === 'flying' || view.status === 'result' || view.status === 'summary') &&
    (view.roundIndex === null || (typeof view.roundIndex === 'number' && Number.isFinite(view.roundIndex))) &&
    typeof view.roundTotal === 'number' && Number.isFinite(view.roundTotal) &&
    (view.levelId === null || typeof view.levelId === 'string') &&
    (view.marker === null || isVec(view.marker)) && typeof view.charging === 'boolean' &&
    (view.ratio === null || (typeof view.ratio === 'number' && Number.isFinite(view.ratio))) &&
    (cloud === null || (cloud !== undefined && isVec(cloud.center) && typeof cloud.radius === 'number' && Number.isFinite(cloud.radius))) &&
    validResult && typeof view.totalScore === 'number' && Number.isFinite(view.totalScore) &&
    typeof view.saved === 'number' && Number.isFinite(view.saved) &&
    typeof view.squad === 'number' && Number.isFinite(view.squad) &&
    typeof view.at === 'number' && Number.isFinite(view.at);
}

/** Returns a fresh idle view with no state from a previous run. */
export function initialLiveView(at = 0): LiveView {
  return {
    status: 'idle',
    roundIndex: null,
    roundTotal: 0,
    levelId: null,
    marker: null,
    charging: false,
    ratio: null,
    cloud: null,
    lastResult: null,
    totalScore: 0,
    saved: 0,
    squad: 0,
    at,
  };
}

/** Returns a new view after applying a message, using the caller's receipt time. */
export function reduceLive(view: LiveView, message: LiveMessage, at = view.at): LiveView {
  if (message.type === 'idle') return initialLiveView(at);
  if (message.type === 'round') {
    return {
      ...view,
      status: 'aiming',
      roundIndex: message.index,
      roundTotal: message.total,
      levelId: message.levelId,
      marker: null,
      charging: false,
      ratio: null,
      cloud: null,
      lastResult: null,
      totalScore: message.index === 0 ? 0 : view.totalScore,
      saved: message.index === 0 ? 0 : view.saved,
      squad: message.index === 0 ? 0 : view.squad,
      at,
    };
  }
  if (message.type === 'aim') {
    return {
      ...view,
      status: 'aiming',
      marker: { ...message.marker },
      charging: message.charging,
      ratio: message.charging ? message.ratio : null,
      at,
    };
  }
  if (message.type === 'flight') {
    return { ...view, status: 'flying', marker: { ...message.marker }, charging: false, ratio: null, at };
  }
  if (message.type === 'cloud') {
    return {
      ...view,
      status: 'flying',
      cloud: { center: { ...message.center }, radius: message.radius },
      marker: null,
      charging: false,
      ratio: null,
      at,
    };
  }
  if (message.type === 'result') {
    const result = { ...message };
    return {
      ...view,
      status: 'result',
      charging: false,
      ratio: message.ratio,
      lastResult: result,
      totalScore: message.score,
      saved: view.saved + message.saved,
      squad: view.squad + 5,
      at,
    };
  }
  return {
    ...view,
    status: 'summary',
    charging: false,
    ratio: view.ratio,
    totalScore: message.score,
    saved: message.saved,
    squad: message.squad,
    at,
  };
}

/** Publishes a live message without letting channel failures affect gameplay. */
export function publishLive(message: LiveMessage): void {
  try {
    getChannel()?.postMessage(message);
  } catch {
    // BroadcastChannel can be unavailable or fail in restricted browser contexts.
  }
}

/** Subscribes to valid live messages and returns a safe unsubscribe function. */
export function onLive(handler: (message: LiveMessage) => void): () => void {
  const shared = getChannel();
  if (!shared) return () => undefined;
  const listener = (event: MessageEvent<unknown>): void => {
    if (!isLiveMessage(event.data)) return;
    try {
      handler(event.data);
    } catch {
      // A subscriber must not break other channel listeners.
    }
  };
  try {
    shared.addEventListener('message', listener);
  } catch {
    return () => undefined;
  }
  return () => {
    try {
      shared.removeEventListener('message', listener);
    } catch {
      // Unsubscribing is best effort when a browser channel has already closed.
    }
  };
}

/** Publishes a private snapshot for a board that joined after the live feed began. */
export function publishLiveSnapshot(view: LiveView): void {
  const message: LiveControlMessage = { control: 'snapshot-state', view };
  try {
    getChannel()?.postMessage(message);
  } catch {
    // Snapshot synchronization is optional when BroadcastChannel is unavailable.
  }
}

/** Requests the latest snapshot without changing the game message protocol. */
export function requestLiveSnapshot(): void {
  const message: LiveControlMessage = { control: 'snapshot-request' };
  try {
    getChannel()?.postMessage(message);
  } catch {
    // A missing channel leaves the board on its attract card.
  }
}

/** Subscribes to valid snapshot responses and returns a safe unsubscribe function. */
export function onLiveSnapshot(handler: (view: LiveView) => void): () => void {
  const shared = getChannel();
  if (!shared) return () => undefined;
  const listener = (event: MessageEvent<unknown>): void => {
    if (typeof event.data !== 'object' || event.data === null) return;
    const message = event.data as Partial<LiveControlMessage>;
    if (message.control !== 'snapshot-state' || !('view' in message) || !isLiveView(message.view)) return;
    try {
      handler(message.view);
    } catch {
      // A subscriber must not break other channel listeners.
    }
  };
  try {
    shared.addEventListener('message', listener);
  } catch {
    return () => undefined;
  }
  return () => {
    try {
      shared.removeEventListener('message', listener);
    } catch {
      // Unsubscribing is best effort when a browser channel has already closed.
    }
  };
}

/** Subscribes to private snapshot requests so the game can respond to late boards. */
export function onLiveSnapshotRequest(handler: () => void): () => void {
  const shared = getChannel();
  if (!shared) return () => undefined;
  const listener = (event: MessageEvent<unknown>): void => {
    if (typeof event.data !== 'object' || event.data === null || (event.data as { control?: unknown }).control !== 'snapshot-request') return;
    try {
      handler();
    } catch {
      // Snapshot synchronization is optional and must not interrupt gameplay.
    }
  };
  try {
    shared.addEventListener('message', listener);
  } catch {
    return () => undefined;
  }
  return () => {
    try {
      shared.removeEventListener('message', listener);
    } catch {
      // Unsubscribing is best effort when a browser channel has already closed.
    }
  };
}