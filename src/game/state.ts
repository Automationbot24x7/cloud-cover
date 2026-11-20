import type { Cloud, Coverage, Segment, ThrowResult, Vec } from '../core/types';
import type { Level } from './levels';

export type Phase = 'attract' | 'intro' | 'aim' | 'flight' | 'reveal' | 'result' | 'summary';

/** 0 exposed, 1 thin cover, 2 covered, 3 perfect cover. */
export type Grade = 0 | 1 | 2 | 3;

export interface RoundResult {
  levelId: string;
  ratio: number;
  grade: Grade;
  points: number;
  basePoints: number;
  timeBonus: number;
  styleBonus: number;
  saved: number;
  bounces: number;
}

export interface Puff {
  dx: number;
  dy: number;
  r: number;
  phase: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}

export interface Ring {
  x: number;
  y: number;
  life: number;
  max: number;
  from: number;
  to: number;
  color: string;
}

export interface Runner {
  /** Delay before this runner leaves cover, seconds. */
  delay: number;
  /** Sideways offset from the lane centre, world units. */
  lane: number;
  /** Where along the crossing (0..1) a spotted runner is stopped. 1 means it makes it. */
  stopAt: number;
}

export const SQUAD_SIZE = 5;

export interface GameState {
  phase: Phase;
  /** Seconds since the current phase began. */
  phaseTime: number;
  /** Seconds since the page loaded. Drives idle animation. */
  clock: number;

  roundIndex: number;
  level: Level;
  walls: Segment[];
  /** Points along the crossing that the watchers are tested against. */
  samples: Vec[];
  /** Sight lines with no cloud on the field: what the watchers can see right now. */
  baseline: Coverage;

  /** Mouse position in world units. */
  aim: Vec;
  /** True once the player has moved the pointer this round. */
  aimed: boolean;
  /** The longest possible throw in the aimed direction. The charge marker travels along it. */
  preview: ThrowResult;
  /** True while the button is held and power is building. */
  charging: boolean;
  /** Current throw distance in world units while charging. */
  charge: number;
  /** +1 while power is rising, -1 while it swings back. */
  chargeDir: 1 | -1;
  /** Where the canister would land if released now. */
  marker: Vec;
  /** While charging: the sight lines as they would be with a cloud at `marker`. */
  live: Coverage | null;
  timeLeft: number;

  thrown: ThrowResult | null;
  flightDuration: number;
  bouncesHeard: number;
  canister: Vec;

  cloud: Cloud | null;
  puffs: Puff[];
  coverage: Coverage | null;
  blocksHeard: number;
  runners: Runner[];

  results: RoundResult[];
  score: number;
  /** Score shown in the HUD, eased towards `score`. */
  shownScore: number;

  particles: Particle[];
  rings: Ring[];
  shake: number;
}

/** World units of throw distance gained per second of holding. */
export const CHARGE_SPEED = 1000;

/** Seconds each scripted phase lasts. */
export const TIMING = {
  intro: 1.25,
  bloom: 0.38,
  sweepStart: 0.22,
  sweepLength: 0.75,
  runStart: 0.95,
  runLength: 1.05,
  reveal: 2.15,
  result: 1.45,
} as const;
