/**
 * Sound design, all synthesised. Every voice takes an audio context, a destination and a start time,
 * so the same code plays live in the game and renders offline to a file for review.
 * Nothing here is sampled or downloaded: the game ships no audio files and needs no network.
 */

type Ctx = BaseAudioContext;

const noiseCache = new WeakMap<Ctx, AudioBuffer>();

/** Two seconds of white noise, made once per context. */
function noiseBuffer(ctx: Ctx): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
    const d = buf.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      d[i] = (seed / 4294967296) * 2 - 1;
    }
    noiseCache.set(ctx, buf);
  }
  return buf;
}

/** An envelope gain: quick attack to `peak`, exponential fall to silence over `decay` seconds. */
function env(ctx: Ctx, dest: AudioNode, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(dest);
  return g;
}

interface ToneSpec {
  type?: OscillatorType;
  freq: number;
  to?: number;
  glide?: number;
  peak: number;
  attack?: number;
  decay: number;
  detune?: number;
}

function tone(ctx: Ctx, dest: AudioNode, t: number, s: ToneSpec): void {
  const o = ctx.createOscillator();
  o.type = s.type ?? 'sine';
  o.frequency.setValueAtTime(s.freq, t);
  if (s.to !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(1, s.to), t + (s.glide ?? s.decay));
  if (s.detune) o.detune.value = s.detune;
  const g = env(ctx, dest, t, s.peak, s.attack ?? 0.004, s.decay);
  o.connect(g);
  o.start(t);
  o.stop(t + (s.attack ?? 0.004) + s.decay + 0.05);
}

interface NoiseSpec {
  type: BiquadFilterType;
  freq: number;
  to?: number;
  q?: number;
  peak: number;
  attack?: number;
  decay: number;
}

function noise(ctx: Ctx, dest: AudioNode, t: number, s: NoiseSpec): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = s.type;
  f.Q.value = s.q ?? 0.8;
  f.frequency.setValueAtTime(s.freq, t);
  if (s.to !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, s.to), t + (s.attack ?? 0.01) + s.decay);
  const g = env(ctx, dest, t, s.peak, s.attack ?? 0.01, s.decay);
  src.connect(f).connect(g);
  src.start(t, Math.random() * 1.5);
  src.stop(t + (s.attack ?? 0.01) + s.decay + 0.05);
}

const curveCache = new WeakMap<Ctx, WaveShaperNode['curve']>();

/** A gentle tanh saturator, so low thumps grow harmonics that laptop speakers can play. */
export function saturator(ctx: Ctx, dest: AudioNode, drive = 2.5): WaveShaperNode {
  const ws = ctx.createWaveShaper();
  let curve = curveCache.get(ctx);
  if (!curve) {
    const c = new Float32Array(1024);
    for (let i = 0; i < c.length; i++) {
      const x = (i / (c.length - 1)) * 2 - 1;
      c[i] = Math.tanh(x * drive) / Math.tanh(drive);
    }
    curve = c;
    curveCache.set(ctx, curve);
  }
  ws.curve = curve;
  ws.oversample = '2x';
  ws.connect(dest);
  return ws;
}

/** Midi note number to frequency. */
export const hz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

export const voices = {
  /** The canister leaves the hand: a whip of air in the midrange over a short cloth-snap thump. */
  throw(ctx: Ctx, dest: AudioNode, t: number): void {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2.2;
    f.frequency.setValueAtTime(350, t);
    f.frequency.exponentialRampToValueAtTime(1900, t + 0.065);
    f.frequency.exponentialRampToValueAtTime(450, t + 0.22);
    src.connect(f).connect(env(ctx, dest, t, 1.4, 0.065, 0.155));
    src.start(t, 0.3);
    src.stop(t + 0.26);
    tone(ctx, dest, t, { freq: 170, to: 65, glide: 0.055, peak: 0.22, decay: 0.07 });
  },

  /** Steel canister on concrete: a bright click exciting four ringing steel modes, different every hit. */
  bounce(ctx: Ctx, dest: AudioNode, t: number, index: number): void {
    noise(ctx, dest, t, { type: 'highpass', freq: 2500, peak: 0.45, attack: 0.001, decay: 0.005 });
    for (const [f, p, d] of [
      [1180, 0.9, 0.11],
      [1740, 0.7, 0.08],
      [2630, 0.5, 0.06],
      [3890, 0.35, 0.04],
    ] as const) {
      const k = Math.pow(0.95, index) * (0.94 + Math.random() * 0.12);
      noise(ctx, dest, t, { type: 'bandpass', freq: f * k, q: 32, peak: p, attack: 0.001, decay: d });
    }
  },

  /** Smoke vents: a sub thump and a small pop, then turbulent gas that swells and rolls for two seconds. */
  bloom(ctx: Ctx, dest: AudioNode, t: number): void {
    tone(ctx, saturator(ctx, dest, 3), t, { freq: 90, to: 38, glide: 0.12, peak: 0.55, attack: 0.004, decay: 0.3 });
    noise(ctx, dest, t, { type: 'bandpass', freq: 1200, q: 1.2, peak: 0.12, attack: 0.002, decay: 0.035 });
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.loop = true;
    const lp1 = ctx.createBiquadFilter();
    lp1.type = 'lowpass';
    lp1.Q.value = 1.2;
    lp1.frequency.setValueAtTime(2000, t + 0.03);
    lp1.frequency.exponentialRampToValueAtTime(320, t + 2.1);
    const lp2 = ctx.createBiquadFilter();
    lp2.type = 'lowpass';
    lp2.frequency.value = 2400;
    // Turbulence: wobble the cutoff so the hiss rolls instead of sitting still.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const depth = ctx.createGain();
    depth.gain.value = 100;
    lfo.connect(depth).connect(lp1.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.17);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 180;
    src.connect(lp1).connect(lp2).connect(hp).connect(g).connect(dest);
    src.start(t + 0.03, 0.7);
    lfo.start(t + 0.03);
    src.stop(t + 2.3);
    lfo.stop(t + 2.3);
  },

  /** A sight line is cut by the cloud: a woody pop with a bright blip on top, climbing. */
  block(ctx: Ctx, dest: AudioNode, t: number, step: number): void {
    tone(ctx, dest, t, { type: 'triangle', freq: hz(76 + (step % 6) * 2), peak: 0.09, attack: 0.002, decay: 0.07 });
    tone(ctx, dest, t, { freq: 2800 + step * 120, peak: 0.07, attack: 0.001, decay: 0.008 });
  },

  /** "GO!": a swish into a wide, heavy A power chord with a pitch punch and a closing filter. */
  go(ctx: Ctx, dest: AudioNode, t: number): void {
    noise(ctx, dest, t, { type: 'bandpass', freq: 400, to: 3000, q: 1.2, peak: 0.22, attack: 0.1, decay: 0.02 });
    const h = t + 0.12;
    noise(ctx, dest, h, { type: 'bandpass', freq: 2500, q: 1, peak: 0.35, attack: 0.001, decay: 0.015 });
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 1.5;
    f.frequency.setValueAtTime(6500, h);
    f.frequency.exponentialRampToValueAtTime(1100, h + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, h);
    g.gain.exponentialRampToValueAtTime(0.3, h + 0.005);
    g.gain.setValueAtTime(0.3, h + 0.125);
    g.gain.exponentialRampToValueAtTime(0.0001, h + 0.48);
    f.connect(g).connect(saturator(ctx, dest, 1.8));
    const punch = Math.pow(2, 3 / 12);
    for (const n of [45, 52, 57]) {
      for (const d of [-14, 0, 14]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.detune.value = d;
        o.frequency.setValueAtTime(hz(n) * punch, h);
        o.frequency.exponentialRampToValueAtTime(hz(n), h + 0.018);
        o.connect(f);
        o.start(h);
        o.stop(h + 0.52);
      }
    }
    tone(ctx, dest, h, { freq: 55, peak: 0.4, attack: 0.005, decay: 0.45 });
  },

  /** Round result: from an alarm (0) through a shaky close call (1) to a bright perfect swell (3). */
  result(ctx: Ctx, dest: AudioNode, t: number, grade: number): void {
    if (grade === 0) {
      for (const d of [-14, 0, 13]) tone(ctx, dest, t, { type: 'sawtooth', freq: hz(45), peak: 0.09, decay: 0.55, detune: d });
      tone(ctx, dest, t, { type: 'square', freq: hz(76), peak: 0.06, decay: 0.09 });
      tone(ctx, dest, t + 0.14, { type: 'square', freq: hz(76), peak: 0.06, decay: 0.09 });
      return;
    }
    if (grade === 1) {
      // A wobbly falling third: "survived, but only just".
      for (const [n, dt] of [
        [76, 0],
        [72, 0.13],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = hz(n);
        const vib = ctx.createOscillator();
        const vg = ctx.createGain();
        vib.frequency.value = 6;
        vg.gain.value = 8;
        vib.connect(vg).connect(o.frequency);
        o.connect(env(ctx, dest, t + dt, 0.14, 0.005, 0.35));
        o.start(t + dt);
        vib.start(t + dt);
        o.stop(t + dt + 0.4);
        vib.stop(t + dt + 0.4);
      }
      return;
    }
    const chord = grade === 2 ? [69, 72, 76] : [72, 76, 79, 84, 88];
    chord.forEach((n, i) => {
      tone(ctx, dest, t + i * 0.07, { type: 'triangle', freq: hz(n), peak: 0.14, attack: 0.005, decay: 0.45 });
      tone(ctx, dest, t + i * 0.07, { type: 'sine', freq: hz(n + 12), peak: 0.04, attack: 0.005, decay: 0.3 });
    });
    if (grade === 3) {
      noise(ctx, dest, t, { type: 'highpass', freq: 6000, peak: 0.12, attack: 0.25, decay: 0.9 });
      tone(ctx, dest, t, { type: 'sine', freq: hz(48), peak: 0.3, decay: 0.8 });
    }
  },

  /** A runner is spotted: a short, cutting sting. */
  spotted(ctx: Ctx, dest: AudioNode, t: number): void {
    tone(ctx, dest, t, { type: 'square', freq: hz(84), to: hz(79), peak: 0.06, decay: 0.12 });
  },

  /** Last-seconds clock tick. */
  tick(ctx: Ctx, dest: AudioNode, t: number): void {
    tone(ctx, dest, t, { freq: 1900, to: 1300, peak: 0.12, attack: 0.001, decay: 0.05 });
    noise(ctx, dest, t, { type: 'bandpass', freq: 2500, q: 3, peak: 0.08, attack: 0.001, decay: 0.02 });
  },

  /** Menu feedback. */
  ui(ctx: Ctx, dest: AudioNode, t: number): void {
    tone(ctx, dest, t, { type: 'triangle', freq: hz(79), to: hz(84), glide: 0.05, peak: 0.1, decay: 0.09 });
  },

  /** Run starts: a riser into a sub drop, an open A minor 9 chord and a crash. */
  start(ctx: Ctx, dest: AudioNode, t: number): void {
    noise(ctx, dest, t, { type: 'bandpass', freq: 300, to: 4000, q: 0.8, peak: 0.2, attack: 0.35, decay: 0.05 });
    const h = t + 0.38;
    tone(ctx, saturator(ctx, dest, 3), h, { freq: 140, to: 38, glide: 0.25, peak: 0.55, decay: 0.35 });
    for (const n of [57, 64, 71, 72]) {
      tone(ctx, dest, h, { type: 'sawtooth', freq: hz(n), peak: 0.045, attack: 0.01, decay: 0.6, detune: -6 });
      tone(ctx, dest, h, { type: 'sawtooth', freq: hz(n), peak: 0.045, attack: 0.01, decay: 0.6, detune: 6 });
    }
    noise(ctx, dest, h, { type: 'highpass', freq: 5000, peak: 0.22, attack: 0.002, decay: 0.9 });
  },
};


/**
 * Charging tension: a fixed A drone (no pitch glide), with the rise carried by a resonant filter opening,
 * a chopper that speeds up, and an E+A fifth fading in for the last third. Returns live controls.
 */
export function chargeVoice(ctx: Ctx, dest: AudioNode, t: number): { set(level: number, at: number): void; stop(at: number): void } {
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.05, t + 0.08);
  out.connect(dest);
  const chop = ctx.createGain();
  chop.gain.value = 0.75;
  chop.connect(out);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 4;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.25;
  lfo.connect(lfoDepth).connect(chop.gain);
  lfo.start(t);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 4.5;
  f.frequency.value = 160;
  f.connect(chop);
  const oscs: OscillatorNode[] = [lfo];
  for (const [n, d] of [
    [33, -7],
    [33, 7],
    [45, -5],
    [45, 5],
  ] as const) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz(n);
    o.detune.value = d;
    o.connect(f);
    o.start(t);
    oscs.push(o);
  }
  const fifth = ctx.createGain();
  fifth.gain.value = 0;
  fifth.connect(out);
  for (const n of [52, 57]) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = hz(n);
    o.connect(fifth);
    o.start(t);
    oscs.push(o);
  }
  return {
    set(level, at) {
      const k = Math.max(0, Math.min(1, level));
      f.frequency.setTargetAtTime(160 + k * 2840, at, 0.04);
      lfo.frequency.setTargetAtTime(4 + k * 14, at, 0.05);
      fifth.gain.setTargetAtTime((Math.max(0, k - 0.7) / 0.3) * 0.6, at, 0.05);
    },
    stop(at) {
      out.gain.cancelScheduledValues(at);
      out.gain.setTargetAtTime(0.0001, at, 0.03);
      for (const o of oscs) o.stop(at + 0.2);
    },
  };
}
