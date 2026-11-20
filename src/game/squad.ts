import { SQUAD_SIZE, TIMING, type GameState } from './state';

/** Where one squad member is this frame, in world units. */
export interface SquadPose {
  x: number;
  y: number;
  /** Heading in radians (0 = +x), the direction the runner faces. */
  heading: number;
  spotted: boolean;
  alpha: number;
  /** Height of a celebration hop, world units (0 when standing). */
  hop: number;
  running: boolean;
}

/** Where each squad member stands while waiting in cover: [distance behind the line, sideways offset]. */
const FORMATION: ReadonlyArray<readonly [number, number]> = [
  [22, -13],
  [22, 13],
  [48, -26],
  [48, 0],
  [48, 26],
];

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);

/** Positions of the five squad members for the current frame (same timing as the 2D renderer). */
export function squadPoses(state: GameState, spread = 1): SquadPose[] {
  const { a, b } = state.level.crossing;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const heading = Math.atan2(uy, ux);

  const running = state.phase === 'reveal' || state.phase === 'result';
  const t = state.phase === 'reveal' ? state.phaseTime : TIMING.reveal + state.phaseTime;
  const poses: SquadPose[] = [];

  for (let i = 0; i < SQUAD_SIZE; i++) {
    const runner = state.runners[i];
    const [back0, side0] = FORMATION[i];
    const back = back0 * spread;
    const side = side0 * spread;
    let along = -back;
    let lane = side;
    let alpha = 1;
    let spotted = false;
    let moving = false;
    let hop = 0;
    if (running && runner) {
      const local = (t - TIMING.runStart - runner.delay) / TIMING.runLength;
      moving = local > 0 && local < 1;
      const progress = easeOutCubic(local);
      const safe = runner.stopAt >= 1;
      const target = safe ? len + back : runner.stopAt * len;
      along = along + (target - along) * progress;
      if (!safe) {
        lane = side * (1 - progress) + runner.lane * spread * progress;
        if (local > 0.8) {
          spotted = true;
          alpha = Math.max(0.35, 1 - (local - 0.8) * 1.2);
        }
      } else {
        const arrived = t - TIMING.runStart - runner.delay - TIMING.runLength * 0.85;
        if (arrived > 0) hop = Math.abs(Math.sin(arrived * 9 + i)) * 14 * Math.max(0, 1 - arrived / 1.6);
      }
    }
    poses.push({
      x: a.x + ux * along + nx * lane,
      y: a.y + uy * along + ny * lane,
      heading,
      spotted,
      alpha,
      hop,
      running: moving,
    });
  }
  return poses;
}
