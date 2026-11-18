/**
 * All sound is synthesised with Web Audio, so the game ships no audio files
 * and works offline. Every call is safe before the first user gesture: it is
 * simply silent until `unlock()` has run inside a click or key handler.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

/** Create or resume the audio context. Call from a user gesture. */
export function unlock(): void {
  if (!ctx) {
    const Ctor = window.AudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

export function setMuted(value: boolean): void {
  muted = value;
  if (master && ctx) master.gain.setTargetAtTime(value ? 0 : 0.5, ctx.currentTime, 0.02);
}

export function isMuted(): boolean {
  return muted;
}

interface ToneOptions {
  type?: OscillatorType;
  from: number;
  to?: number;
  duration: number;
  gain?: number;
  delay?: number;
}

function tone({ type = 'sine', from, to, duration, gain = 0.25, delay = 0 }: ToneOptions): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + duration);
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(env).connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

interface NoiseOptions {
  duration: number;
  gain?: number;
  from: number;
  to: number;
  q?: number;
  delay?: number;
}

function noise({ duration, gain = 0.2, from, to, q = 1, delay = 0 }: NoiseOptions): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + delay;
  const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t0);
  filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + duration);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(filter).connect(env).connect(master);
  src.start(t0);
}

/** A rising tone that follows the power meter while the button is held. */
export const chargeTone = (() => {
  let osc: OscillatorNode | null = null;
  let env: GainNode | null = null;
  return {
    start(): void {
      if (!ctx || !master || osc) return;
      osc = ctx.createOscillator();
      env = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 140;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      env.gain.setValueAtTime(0.0001, ctx.currentTime);
      env.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 0.05);
      osc.connect(filter).connect(env).connect(master);
      osc.start();
    },
    /** `level` is the power from 0 to 1. */
    set(level: number): void {
      if (!ctx || !osc) return;
      osc.frequency.setTargetAtTime(140 + 420 * Math.max(0, Math.min(1, level)), ctx.currentTime, 0.02);
    },
    stop(): void {
      if (!ctx || !osc || !env) return;
      const o = osc;
      env.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.02);
      o.stop(ctx.currentTime + 0.12);
      osc = null;
      env = null;
    },
  };
})();

export const sfx = {
  /** Canister leaves the hand. */
  throw(): void {
    noise({ duration: 0.22, from: 900, to: 2600, gain: 0.18, q: 0.8 });
    tone({ type: 'triangle', from: 220, to: 420, duration: 0.14, gain: 0.12 });
  },
  /** Canister clips a wall. Pitch rises with each bounce. */
  bounce(index: number): void {
    const base = 520 + index * 140;
    tone({ type: 'square', from: base, to: base * 0.7, duration: 0.07, gain: 0.1 });
    noise({ duration: 0.05, from: 3000, to: 1200, gain: 0.08, q: 2 });
  },
  /** Cloud blooms. */
  bloom(): void {
    tone({ from: 150, to: 48, duration: 0.42, gain: 0.4 });
    noise({ duration: 0.75, from: 2400, to: 300, gain: 0.22, q: 0.5 });
  },
  /** A sight line is cut by the cloud. */
  block(step: number): void {
    tone({ type: 'triangle', from: 660 + step * 28, duration: 0.06, gain: 0.05 });
  },
  /** Round result. `grade` 0 is worst, 3 is a perfect cover. */
  result(grade: number): void {
    const scales = [
      [196, 174],
      [330, 392],
      [392, 494, 587],
      [523, 659, 784, 1047],
    ];
    const notes = scales[Math.max(0, Math.min(3, grade))];
    notes.forEach((f, i) => tone({ type: 'triangle', from: f, duration: 0.24, gain: 0.2, delay: i * 0.085 }));
    if (grade === 0) tone({ type: 'sawtooth', from: 110, to: 70, duration: 0.35, gain: 0.12 });
  },
  /** Last-seconds warning tick. */
  tick(): void {
    tone({ type: 'square', from: 880, duration: 0.04, gain: 0.07 });
  },
  /** Menu and button feedback. */
  ui(): void {
    tone({ type: 'triangle', from: 520, to: 780, duration: 0.09, gain: 0.12 });
  },
  /** Run starts. */
  start(): void {
    [392, 523, 784].forEach((f, i) => tone({ type: 'triangle', from: f, duration: 0.18, gain: 0.18, delay: i * 0.07 }));
  },
};
