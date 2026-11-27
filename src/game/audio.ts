/**
 * Live audio for the game: sound effects from voices.ts and the adaptive music from music.ts.
 * Every call is safe before the first user gesture: it is simply silent until `unlock()` has run
 * inside a click or key handler (browsers block audio until then).
 */
import { createMusic, type Music } from './music';
import { chargeVoice, voices } from './voices';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let music: Music | null = null;
let muted = false;
/** While true, effects are silent (the title-screen demo plays without sound). */
let quiet = false;

/** Silence sound effects (not music) while the attract demo runs. */
export function setQuiet(value: boolean): void {
  quiet = value;
}

/** Create or resume the audio context. Call from a user gesture. */
export function unlock(): void {
  if (!ctx) {
    const Ctor = window.AudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    // A gentle limiter keeps stacked effects and music from clipping on booth speakers.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    limiter.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(limiter);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 1;
    sfxBus.connect(master);
    music = createMusic(ctx, master, ctx.currentTime + 0.1);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

export function setMuted(value: boolean): void {
  muted = value;
  if (master && ctx) master.gain.setTargetAtTime(value ? 0 : 0.8, ctx.currentTime, 0.02);
}

export function isMuted(): boolean {
  return muted;
}

/**
 * Keep the music scheduled and matched to the game. Call once per frame.
 * `phase` is the game phase; `tension` is 0..1 (how far the throw is charged).
 */
export function updateMusic(phase: string, tension: number): void {
  if (!ctx || !music) return;
  const now = ctx.currentTime;
  // Charging is the busiest layer; once the canister is thrown the music steps back so the effects read.
  const level = phase === 'attract' || phase === 'summary' ? 0 : tension > 0 ? 2 : 1;
  music.setIntensity(level, now);
  music.setTension(tension, now);
  music.schedule(now + 0.2);
}

function play(fn: (c: BaseAudioContext, d: AudioNode, t: number) => void): void {
  if (!ctx || !sfxBus || quiet) return;
  fn(ctx, sfxBus, ctx.currentTime + 0.005);
}

/** The charging hum that follows the power meter while the button is held. */
export const chargeTone = (() => {
  let voice: ReturnType<typeof chargeVoice> | null = null;
  return {
    start(): void {
      if (!ctx || !sfxBus || voice || quiet) return;
      voice = chargeVoice(ctx, sfxBus, ctx.currentTime);
    },
    /** `level` is the power from 0 to 1. */
    set(level: number): void {
      if (ctx && voice) voice.set(level, ctx.currentTime);
    },
    stop(): void {
      if (ctx && voice) voice.stop(ctx.currentTime);
      voice = null;
    },
  };
})();

export const sfx = {
  throw: (): void => {
    play(voices.throw);
    // Make room for the bounces, the bloom and "GO!": they happen within about 1.6 s of the throw.
    if (ctx) music?.duck(ctx.currentTime, 1.6);
  },
  bounce: (index: number): void => play((c, d, t) => voices.bounce(c, d, t, index)),
  bloom: (): void => play(voices.bloom),
  block: (step: number): void => play((c, d, t) => voices.block(c, d, t, step)),
  go: (): void => play(voices.go),
  spotted: (): void => play(voices.spotted),
  result: (grade: number): void => {
    play((c, d, t) => voices.result(c, d, t, grade));
    if (ctx) music?.duck(ctx.currentTime, 0.7, 0.56, 1500);
    if (grade === 3) music?.lift();
  },
  tick: (): void => play(voices.tick),
  ui: (): void => play(voices.ui),
  start: (): void => play(voices.start),
};
