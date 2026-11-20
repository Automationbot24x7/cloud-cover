/**
 * Adaptive music, synthesised live (original composition, no samples, works offline).
 *
 * A four-bar loop in A minor (Am - F - C - G) at 110 bpm. Layers come in with the game's intensity:
 *   0  title / summary: pad and a soft arpeggio
 *   1  aiming:          + bass, kick, hats
 *   2  charging / throw: + clap, 16th hats, brighter arpeggio
 * A separate "tension" value (0..1) opens a filter on the whole music bus while the player charges.
 * Notes are scheduled slightly ahead of time, the usual Web Audio pattern, so timing stays tight.
 */
import { hz, saturator } from './voices';

type Ctx = BaseAudioContext;

const BPM = 110;
const STEP = 60 / BPM / 4; // a sixteenth note, in seconds
const BAR_STEPS = 16;
// Eight bars: Am F C G, then a turn through Dm and E so the loop resolves instead of droning.
const ROOTS = [45, 41, 48, 43, 45, 41, 50, 40]; // A F C G A F D E
const CHORDS = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [55, 60, 64], // C
  [55, 59, 62], // G
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [53, 57, 62], // Dm
  [56, 59, 64], // E
];
// A sparse pentatonic hook over the eight bars: [bar, sixteenth, midi, length in sixteenths].
const LEAD: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 0, 76, 3], [0, 4, 79, 2], [0, 6, 81, 6],
  [1, 4, 79, 2], [1, 6, 76, 4], [1, 12, 74, 4],
  [2, 0, 76, 3], [2, 4, 79, 2], [2, 6, 84, 6],
  [3, 4, 83, 2], [3, 6, 81, 4], [3, 12, 79, 4],
  [4, 0, 76, 3], [4, 4, 79, 2], [4, 6, 81, 6],
  [5, 4, 84, 2], [5, 6, 81, 4], [5, 12, 79, 4],
  [6, 0, 77, 4], [6, 6, 76, 2], [6, 8, 74, 4],
  [7, 0, 71, 4], [7, 6, 76, 2], [7, 8, 80, 8],
];

export interface Music {
  /** Schedule everything due up to `until` (seconds, context time). Call often, a little ahead. */
  schedule(until: number): void;
  setIntensity(level: 0 | 1 | 2, at: number): void;
  setTension(value: number, at: number): void;
  /** A one-off lift on the next downbeat (used for a perfect cover). */
  lift(): void;
  /** Dip the music from `at` for `hold` seconds (gain down, top end rolled off to `cutoff` Hz), then swell back. */
  duck(at: number, hold: number, depth?: number, cutoff?: number): void;
  stop(at: number): void;
}

export function createMusic(ctx: Ctx, dest: AudioNode, startAt: number): Music {
  const bus = ctx.createGain();
  bus.gain.value = 0.55;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 2400;
  tone.Q.value = 0.7;
  // Ducking stage: dips the music for important cues (throw to GO).
  const duckGain = ctx.createGain();
  const duckTone = ctx.createBiquadFilter();
  duckTone.type = 'lowpass';
  duckTone.frequency.value = 20000;
  bus.connect(tone).connect(duckTone).connect(duckGain).connect(dest);
  // Bass gets its own gain so every kick can pump it (synthwave sidechain feel).
  const bassBus = ctx.createGain();
  bassBus.gain.value = 1;
  bassBus.connect(bus);
  // A dotted-eighth echo for the lead.
  const delay = ctx.createDelay(1);
  delay.delayTime.value = STEP * 3;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  const delayOut = ctx.createGain();
  delayOut.gain.value = 0.45;
  const fbTone = ctx.createBiquadFilter();
  fbTone.type = 'lowpass';
  fbTone.frequency.value = 1400;
  delay.connect(fbTone).connect(fb).connect(delay);
  delay.connect(delayOut).connect(bus);
  const leadBus = ctx.createGain();
  leadBus.gain.value = 1;
  leadBus.connect(bus);
  leadBus.connect(delay);

  let step = 0;
  let nextTime = startAt;
  let intensity: 0 | 1 | 2 = 0;
  let pendingLift = false;
  let stopped = false;

  const noiseBuf = ((): AudioBuffer => {
    const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    let s = 777;
    for (let i = 0; i < d.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      d[i] = (s / 4294967296) * 2 - 1;
    }
    return b;
  })();

  function gainEnv(t: number, peak: number, attack: number, decay: number): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(bus);
    return g;
  }

  const kickSat = saturator(ctx, bus, 3);

  function kick(t: number): void {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.045);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(kickSat);
    o.start(t);
    o.stop(t + 0.35);
    const c = ctx.createOscillator();
    c.frequency.setValueAtTime(1200, t);
    c.frequency.exponentialRampToValueAtTime(200, t + 0.01);
    c.connect(gainEnv(t, 0.18, 0.001, 0.012));
    c.start(t);
    c.stop(t + 0.03);
    // Pump the bass out of the kick's way.
    bassBus.gain.setValueAtTime(0.7, t);
    bassBus.gain.setTargetAtTime(1, t + 0.02, 0.06);
  }

  function noiseHit(t: number, type: BiquadFilterType, freq: number, peak: number, decay: number): void {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = type === 'bandpass' ? 1.2 : 0.7;
    s.connect(f).connect(gainEnv(t, peak, 0.001, decay));
    s.start(t, (t * 0.37) % 0.5);
    s.stop(t + decay + 0.05);
  }

  /** Snare: a pitched drum body with a filtered noise layer underneath. `level` 1 = full, lower = softer. */
  function clap(t: number, level = 1, decay = 0.2): void {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(110, t + 0.045);
    o.connect(gainEnv(t, 0.42 * level, 0.001, 0.12));
    o.start(t);
    o.stop(t + 0.16);
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 300;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4200;
    s.connect(hp).connect(lp).connect(gainEnv(t, 0.07 * level, 0.001, decay));
    s.start(t, (t * 0.37) % 0.5);
    s.stop(t + decay + 0.05);
  }

  function bass(t: number, midi: number, len: number): void {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 5;
    f.frequency.setValueAtTime(1580, t);
    f.frequency.exponentialRampToValueAtTime(180, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    f.connect(g).connect(bassBus);
    for (const d of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(midi);
      o.detune.value = d;
      o.connect(f);
      o.start(t);
      o.stop(t + len + 0.05);
    }
  }

  function lead(t: number, midi: number, len: number): void {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(4500, t);
    f.frequency.exponentialRampToValueAtTime(1800, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03, t + 0.01);
    g.gain.setValueAtTime(0.03, t + len * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    f.connect(g).connect(leadBus);
    for (const [type, d] of [
      ['square', -5],
      ['sawtooth', 5],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = hz(midi);
      o.detune.value = d;
      o.connect(f);
      o.start(t);
      o.stop(t + len + 0.05);
    }
  }

  function pluck(t: number, midi: number, bright: boolean): void {
    const o = ctx.createOscillator();
    o.type = bright ? 'square' : 'triangle';
    o.frequency.value = hz(midi);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(bright ? 3200 : 1600, t);
    f.frequency.exponentialRampToValueAtTime(400, t + 0.22);
    o.connect(f).connect(gainEnv(t, bright ? 0.05 : 0.06, 0.003, 0.22));
    o.start(t);
    o.stop(t + 0.3);
  }

  function pad(t: number, chord: number[], len: number, lifted: boolean): void {
    for (const n of chord) {
      for (const d of [-8, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(n + (lifted ? 12 : 0));
        o.detune.value = d;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = lifted ? 2600 : 1100;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.018, t + 0.5);
        g.gain.setValueAtTime(0.018, t + len - 0.4);
        g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.3);
        o.connect(f).connect(g).connect(bus);
        o.start(t);
        o.stop(t + len + 0.4);
      }
    }
  }

  function playStep(t: number, s: number): void {
    const bar = Math.floor(s / BAR_STEPS) % 8;
    const inBar = s % BAR_STEPS;
    const chord = CHORDS[bar];
    const barLen = STEP * BAR_STEPS;

    if (inBar === 0) {
      const lifted = pendingLift;
      pendingLift = false;
      pad(t, chord, barLen, lifted);
    }
    // Arpeggio: 8ths when calm, 16ths with an octave jump when busy.
    const arpEvery = intensity >= 2 ? 1 : 2;
    if (inBar % arpEvery === 0) {
      const idx = Math.floor(inBar / arpEvery);
      const octave = intensity >= 2 && idx % 4 === 3 ? 12 : 0;
      pluck(t, chord[idx % 3] + 12 + octave, intensity >= 2);
    }
    if (intensity >= 1) {
      if (inBar % 4 === 0) kick(t);
      // Rolling eighths, root with an octave lift on the off-beat.
      if (inBar % 2 === 0) bass(t, ROOTS[bar] - 12 + (inBar % 4 === 2 ? 12 : 0), STEP * 1.8);
      for (const [lb, ls, ln, ll] of LEAD) if (lb === bar && ls === inBar) lead(t, ln, STEP * ll);
      if (inBar % 2 === 1 || intensity >= 2) noiseHit(t, 'highpass', 8000, inBar % 4 === 2 ? 0.07 : 0.045, 0.04);
    }
    if (inBar === 4 || inBar === 12) {
      if (intensity >= 2) clap(t, 1, 0.2);
      else if (intensity >= 1) clap(t, 0.6, 0.11);
    }
  }

  return {
    schedule(until) {
      if (stopped) return;
      while (nextTime < until) {
        playStep(nextTime, step);
        step++;
        nextTime += STEP;
      }
    },
    setIntensity(level) {
      intensity = level;
    },
    setTension(value, at) {
      const k = Math.max(0, Math.min(1, value));
      tone.frequency.setTargetAtTime(2400 + k * 7000, at, 0.08);
      bus.gain.setTargetAtTime(0.55 + k * 0.08, at, 0.1);
    },
    lift() {
      pendingLift = true;
    },
    duck(at, hold, depth = 0.5, cutoff = 600) {
      duckGain.gain.cancelScheduledValues(at);
      duckTone.frequency.cancelScheduledValues(at);
      duckGain.gain.setTargetAtTime(depth, at, 0.03);
      duckTone.frequency.setTargetAtTime(cutoff, at, 0.03);
      duckGain.gain.setTargetAtTime(1, at + hold, 0.1);
      duckTone.frequency.setTargetAtTime(20000, at + hold, 0.12);
    },
    stop(at) {
      stopped = true;
      bus.gain.setTargetAtTime(0.0001, at, 0.3);
    },
  };
}
