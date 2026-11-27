import { DEFAULT_THROW } from '../core/throw';
import type { Segment, ThrowOptions, Vec } from '../core/types';

/** Logical size of the play field. The canvas is scaled to fit the window. */
export const WORLD = { w: 1600, h: 900 } as const;

/** Inner bounds of the arena. Throws bounce off this outline. */
export const ARENA = { x: 50, y: 110, w: 1500, h: 740 } as const;

/** Throw tuning for the game: a longer reach than the core default so full-field banks are possible. */
export const THROW: ThrowOptions = { ...DEFAULT_THROW, maxRange: 2800, maxBounces: 5 };

export type Assist = 'full' | 'first';

/** Difficulty: 1 tutorial, 2 easy, 3 needs a bank, 4 hard bank, 5 final-round hard. */
export type Tier = 1 | 2 | 3 | 4 | 5;

export interface Level {
  id: string;
  tier: Tier;
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

/** The whole map pool. A run draws six of these by tier (see run.ts). */
export const LEVELS: Level[] = [
  {
    id: 'open-gap',
    tier: 1,
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
    tier: 2,
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
    tier: 3,
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
    tier: 3,
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
    tier: 4,
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
    tier: 5,
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
  {
    id: 'slantwalk',
    tier: 1,
    title: 'Slantwalk',
    brief: 'Cover the long diagonal crossing.',
    blocks: [
      [{ x: 360, y: 110 }, { x: 570, y: 110 }, { x: 360, y: 270 }],
      rect(1080, 650, 200, 150),
    ],
    thrower: { x: 230, y: 600 },
    watchers: [{ x: 1400, y: 220 }],
    crossing: { a: { x: 740, y: 380 }, b: { x: 940, y: 540 } },
    cloudRadius: 125,
    assist: 'full',
    seconds: 10,
  },
  {
    id: 'low-bridge',
    tier: 1,
    title: 'Low Bridge',
    brief: 'Lay a cloud across the lower crossing.',
    blocks: [rect(300, 720, 180, 130), rect(1040, 110, 180, 160)],
    thrower: { x: 1250, y: 650 },
    watchers: [{ x: 300, y: 300 }],
    crossing: { a: { x: 690, y: 610 }, b: { x: 930, y: 610 } },
    cloudRadius: 125,
    assist: 'full',
    seconds: 10,
  },
  {
    id: 'wide-pincer',
    tier: 2,
    title: 'Wide Pincer',
    brief: 'Two watchers face the crossing from opposite sides.',
    blocks: [rect(550, 110, 180, 140), rect(1060, 690, 170, 160)],
    thrower: { x: 240, y: 380 },
    watchers: [{ x: 360, y: 690 }, { x: 1380, y: 250 }],
    crossing: { a: { x: 840, y: 350 }, b: { x: 840, y: 570 } },
    cloudRadius: 125,
    assist: 'full',
    seconds: 10,
  },
  {
    id: 'split-horizon',
    tier: 2,
    title: 'Split Horizon',
    brief: 'Shield the crossing from above and below.',
    blocks: [
      [{ x: 190, y: 110 }, { x: 420, y: 110 }, { x: 310, y: 250 }],
      rect(1180, 610, 190, 130),
    ],
    thrower: { x: 1320, y: 390 },
    watchers: [{ x: 480, y: 150 }, { x: 1000, y: 810 }],
    crossing: { a: { x: 650, y: 450 }, b: { x: 870, y: 510 } },
    cloudRadius: 130,
    assist: 'full',
    seconds: 9,
  },
  {
    id: 'lower-return',
    tier: 3,
    title: 'Lower Return',
    brief: 'Bank below the tall barrier.',
    blocks: [rect(500, 110, 80, 410)],
    thrower: { x: 230, y: 260 },
    watchers: [{ x: 1450, y: 160 }, { x: 620, y: 820 }],
    crossing: { a: { x: 970, y: 490 }, b: { x: 970, y: 710 } },
    cloudRadius: 125,
    assist: 'full',
    seconds: 10,
  },
  {
    id: 'right-turn',
    tier: 3,
    title: 'Right Turn',
    brief: 'Use the right wall to pass the shelf.',
    blocks: [rect(50, 400, 1250, 65)],
    thrower: { x: 1360, y: 250 },
    watchers: [{ x: 300, y: 760 }, { x: 1450, y: 800 }],
    crossing: { a: { x: 900, y: 670 }, b: { x: 1120, y: 670 } },
    cloudRadius: 125,
    assist: 'full',
    seconds: 10,
  },
  {
    id: 'left-hook',
    tier: 4,
    title: 'Left Hook',
    brief: 'Hook around the shelf from the left.',
    blocks: [rect(350, 380, 1200, 70)],
    thrower: { x: 240, y: 240 },
    watchers: [{ x: 150, y: 800 }, { x: 1450, y: 820 }],
    crossing: { a: { x: 700, y: 600 }, b: { x: 850, y: 760 } },
    cloudRadius: 110,
    assist: 'first',
    seconds: 9,
  },
  {
    id: 'upper-elbow',
    tier: 4,
    title: 'Upper Elbow',
    brief: 'Send the canister above the barrier.',
    blocks: [rect(900, 350, 80, 500)],
    thrower: { x: 1320, y: 700 },
    watchers: [{ x: 100, y: 450 }, { x: 700, y: 130 }, { x: 650, y: 820 }],
    crossing: { a: { x: 500, y: 400 }, b: { x: 700, y: 540 } },
    cloudRadius: 110,
    assist: 'first',
    seconds: 9,
  },
  {
    id: 'stone-wedge',
    tier: 4,
    title: 'Stone Wedge',
    brief: 'Go over the wedge to reach the crossing.',
    blocks: [[{ x: 500, y: 460 }, { x: 780, y: 850 }, { x: 500, y: 850 }]],
    thrower: { x: 260, y: 700 },
    watchers: [{ x: 1450, y: 150 }, { x: 1450, y: 800 }, { x: 850, y: 800 }],
    crossing: { a: { x: 960, y: 350 }, b: { x: 1180, y: 350 } },
    cloudRadius: 115,
    assist: 'first',
    seconds: 9,
  },
  {
    id: 'south-arc',
    tier: 5,
    title: 'South Arc',
    brief: 'Bank twice around the screens.',
    blocks: [
      [{ x: 500, y: 110 }, { x: 590, y: 110 }, { x: 560, y: 510 }, { x: 500, y: 510 }],
      rect(360, 380, 80, 230),
    ],
    thrower: { x: 240, y: 260 },
    watchers: [{ x: 680, y: 150 }, { x: 1400, y: 200 }, { x: 1400, y: 780 }],
    crossing: { a: { x: 850, y: 700 }, b: { x: 1050, y: 700 } },
    cloudRadius: 115,
    assist: 'first',
    seconds: 8,
  },
  {
    id: 'far-shelf',
    tier: 5,
    title: 'Far Shelf',
    brief: 'Find the right wall beyond the shelf.',
    blocks: [
      rect(50, 390, 1250, 80),
      [{ x: 700, y: 110 }, { x: 1080, y: 110 }, { x: 900, y: 250 }],
    ],
    thrower: { x: 1350, y: 250 },
    watchers: [{ x: 250, y: 550 }, { x: 250, y: 800 }, { x: 1450, y: 550 }, { x: 1450, y: 800 }],
    crossing: { a: { x: 1000, y: 590 }, b: { x: 1000, y: 790 } },
    cloudRadius: 105,
    assist: 'first',
    seconds: 8,
  },
  {
    id: 'reverse-arc',
    tier: 5,
    title: 'Reverse Arc',
    brief: 'Bank twice past the slanted barrier.',
    blocks: [
      rect(1000, 110, 80, 410),
      [{ x: 1160, y: 370 }, { x: 1240, y: 370 }, { x: 1240, y: 590 }, { x: 1190, y: 590 }],
    ],
    thrower: { x: 1370, y: 250 },
    watchers: [{ x: 150, y: 200 }, { x: 180, y: 780 }, { x: 750, y: 140 }],
    crossing: { a: { x: 450, y: 570 }, b: { x: 650, y: 690 } },
    cloudRadius: 115,
    assist: 'first',
    seconds: 8,
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
