import { DEFAULT_THROW } from '../core/throw';
import type { Segment, ThrowOptions, Vec } from '../core/types';

/** Logical size of the play field. The canvas is scaled to fit the window. */
export const WORLD = { w: 1600, h: 900 } as const;

/** Inner bounds of the arena. Throws bounce off this outline. */
export const ARENA = { x: 50, y: 110, w: 1500, h: 740 } as const;

/** Throw tuning for the game: a longer reach than the core default so full-field banks are possible. */
export const THROW: ThrowOptions = { ...DEFAULT_THROW, maxRange: 1900 };

export type Assist = 'full' | 'first';

export interface Level {
  id: string;
  /** Short title shown on the round banner. */
  title: string;
  /** One line shown under the title. Plain words, no jargon. */
  brief: string;
  /** Solid buildings, as polygons. They block throws and sight. */
  blocks: Vec[][];
  thrower: Vec;
  watchers: Vec[];
  /** The squad runs from `a` to `b`. */
  crossing: { a: Vec; b: Vec };
  cloudRadius: number;
  /** `full` draws the whole predicted path, `first` only up to the first bounce. */
  assist: Assist;
  /** Seconds allowed to aim. */
  seconds: number;
}

/** Axis-aligned rectangle as a polygon, clockwise from the top-left corner. */
function rect(x: number, y: number, w: number, h: number): Vec[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

const R = 85;

export const LEVELS: Level[] = [
  {
    id: 'open-gap',
    title: 'Open Gap',
    brief: 'One watcher. Drop your cloud in front of it.',
    blocks: [rect(700, 110, 200, 150), rect(700, 620, 200, 230), rect(1130, 620, 150, 110), rect(330, 560, 130, 130)],
    thrower: { x: 250, y: 340 },
    watchers: [{ x: 1400, y: 435 }],
    crossing: { a: { x: 800, y: 550 }, b: { x: 800, y: 330 } },
    cloudRadius: R,
    assist: 'full',
    seconds: 10,
  },
  {
    id: 'doorway',
    title: 'The Doorway',
    brief: 'Two watchers, one door. Cloud the door.',
    blocks: [rect(900, 110, 60, 290), rect(900, 520, 60, 330), rect(1180, 400, 110, 120), rect(300, 640, 150, 120)],
    thrower: { x: 240, y: 300 },
    watchers: [
      { x: 1400, y: 290 },
      { x: 1400, y: 650 },
    ],
    crossing: { a: { x: 560, y: 620 }, b: { x: 560, y: 300 } },
    cloudRadius: R,
    assist: 'full',
    seconds: 10,
  },
  {
    id: 'over-the-top',
    title: 'Off The Wall',
    brief: 'Bank your smoke off the top wall.',
    blocks: [rect(520, 400, 90, 450), rect(240, 180, 150, 110)],
    thrower: { x: 230, y: 700 },
    watchers: [{ x: 1400, y: 740 }, { x: 1400, y: 200 }],
    crossing: { a: { x: 900, y: 620 }, b: { x: 900, y: 400 } },
    cloudRadius: 140,
    assist: 'full',
    seconds: 10,
  },
  {
    id: 'side-pocket',
    title: 'Side Pocket',
    brief: 'A pillar hides the door. Go over it or under it.',
    blocks: [rect(900, 110, 60, 290), rect(900, 520, 60, 330), rect(500, 330, 80, 300), rect(1180, 400, 110, 120)],
    thrower: { x: 220, y: 480 },
    watchers: [
      { x: 1400, y: 290 },
      { x: 1400, y: 650 },
    ],
    crossing: { a: { x: 720, y: 620 }, b: { x: 720, y: 300 } },
    cloudRadius: 95,
    assist: 'first',
    seconds: 9,
  },
  {
    id: 'angle-shot',
    title: 'Angle Shot',
    brief: 'The slanted wall sends it where you cannot reach.',
    blocks: [
      [
        { x: 250, y: 110 },
        { x: 800, y: 110 },
        { x: 800, y: 330 },
      ],
      rect(480, 480, 80, 370),
    ],
    thrower: { x: 240, y: 620 },
    watchers: [{ x: 1400, y: 800 }, { x: 1450, y: 340 }],
    crossing: { a: { x: 850, y: 620 }, b: { x: 850, y: 400 } },
    cloudRadius: 140,
    assist: 'first',
    seconds: 9,
  },
  {
    id: 'crossfire',
    title: 'Crossfire',
    brief: 'Watchers on every side. Only the crossing itself is safe to cloud.',
    blocks: [rect(470, 360, 80, 330), rect(1150, 330, 90, 90), rect(1010, 640, 120, 100)],
    thrower: { x: 220, y: 620 },
    watchers: [
      { x: 1400, y: 210 },
      { x: 1400, y: 730 },
      { x: 300, y: 190 },
    ],
    crossing: { a: { x: 710, y: 470 }, b: { x: 880, y: 470 } },
    cloudRadius: 105,
    assist: 'first',
    seconds: 9,
  },
];

/** Every polygon edge of a level plus the arena outline, as wall segments. */
export function wallsOf(level: Level): Segment[] {
  const outline = rect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
  const polys = [outline, ...level.blocks];
  const out: Segment[] = [];
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      out.push({ a: poly[i], b: poly[(i + 1) % poly.length] });
    }
  }
  return out;
}
