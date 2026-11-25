# Cloud Cover

**Bank the smoke. Hide the crossing. Save the squad.**

A 90-second mini game for an esports event booth. Point, hold to power up, release: the smoke canister banks off the walls like a pool ball and blooms into a cloud. Every sight line the cloud cuts between the watchers and the crossing is one your squad runs through unseen.

**Play it:** https://automationbot24x7.github.io/cloud-cover/ (mouse or touch, works offline after the first visit)
**Booth spectator screen:** https://automationbot24x7.github.io/cloud-cover/board.html

Built for the Cloud9 x JetBrains *Sky's The Limit* Hackathon 2026, Category 3: Event Mini Game.

## Why this game

Fans in a booth line have a minute or two, no tutorial and one hand on a mouse. Most booth games test raw reflexes. Cloud Cover tests something competitive players actually practise and rarely get to show off: **reading angles**, bouncing utility off geometry to deny an opponent's line of sight.

- **One control.** Aim, hold, release. The power line runs out along the real bounce path and the landing ring shows where it will bloom.
- **Instant cause and effect.** While you charge, the watchers' red view of the crossing shrinks live and a "% hidden" readout tells you how good the throw is before you let go.
- **A short, readable story per throw.** The cloud blooms, "GO!", and your five-person squad runs. Anyone a watcher can still see is caught in a red line and flagged SPOTTED, and the tally shows how many made it.
- **Six rounds, about 90 seconds**, rising from a straight drop to bank shots off slanted walls with only the first bounce shown.
- **The same six maps for everyone each day**, drawn by difficulty from a pool of 18 and ending on the **Map of the Day**, so the leaderboard is a fair contest and regulars come back tomorrow.
- **A night rooftop in 3D**: searchlight turrets whose beams are built from the same ray casts the rules use, so what looks lit is exactly what a watcher can see. Original synthesised sound and adaptive music.

## Booth-ready

- **Attract screen** with today's top five, and an automatic return to it after each run or 45 seconds without input.
- **Live spectator screen** (`board.html`): open it in a second window, drag it to the other monitor, press F11. The queue watches the current run live (map, aim, live % hidden, the cloud, who got through) beside today's top 10. It talks to the game on the same machine with no network, and shows "NEXT UP: YOU" between players.
- **Safe mode for any laptop.** If the machine has no 3D graphics, the graphics driver resets, or the frame rate stays low, the game switches itself to a flat 2D renderer with identical rules and scores. Staff can switch by hand with Ctrl+Shift+G or from the staff panel; `?r=2d` forces it.
- **Works offline** once loaded (installable web app with a service worker). Scores are stored locally.
- **Hidden staff panel: Ctrl+Shift+O.** Today's runs, best and average; reset to title; open the spectator window; sound on/off; 3D or safe mode; download today's scores as CSV; clear today's board (two clicks).
- **Soak tested:** 60 full runs back to back with GPU memory flat and no errors (`tools/soak.mjs` in the build notes).
- **Three-letter tag entry** by mouse or keyboard, with a rank title for the run.

## How it works

- `src/core/`: pure, deterministic TypeScript. Ray casting against wall segments, the bouncing throw path, and sight-line coverage (`watchers x 24 points along the crossing`, each line classed as blocked by a wall, blocked by the cloud, or open). Score = cloud-blocked lines / (cloud-blocked + open).
- `src/game/`: state machine, the 18-map pool and daily run, the 3D renderer (three.js) and the flat 2D renderer, synthesised Web Audio sound and music, HUD, local leaderboard, live spectator feed and the staff panel.
- `tools/solve.ts` and `src/game/levelcheck.ts`: a level checker that tries every direction and power on each map. The tests use it to prove every map is solvable with a fair power window, that harder maps need a bank shot, and that parking the smoke on a turret is never the easy answer.

## Built with JetBrains tools

- **WebStorm** is the project's IDE. Shared run configurations are committed in `.idea/runConfigurations` (play, unit tests, build, level solver).
- **Junie** did real, reviewable pieces of the build from written briefs, each committed on its own. The briefs are in `.junie/tasks/` and the project rules in `.junie/guidelines.md`:
  1. the simulation core and its first 41 unit tests,
  2. fixes after code review (a ray/segment bound bug that made walls act longer than drawn) plus regression tests,
  3. the booth kit (staff panel, idle reset, offline install, leaderboard tests),
  4. network-first page caching so updates reach booth laptops,
  5. fixes for WebStorm's inspection findings,
  6. fair rounds (a second watcher on two maps after the solver found a shortcut),
  7. twelve new maps for the pool, every one passing the fairness tests,
  8. the live spectator screen, run as an agent session in **JetBrains Air** inside WebStorm (record and screenshot in `docs/jetbrains/air-session-008.md`).
- **WebStorm's code inspector**, run headless over `src/`, found 22 real issues (duplicated code, dead code, invalid CSS, grammar); after the fixes a second run found 3, which were then fixed. Results: `docs/inspections/`.

A longer write-up of the JetBrains workflow is in [`AI_SHOWCASE.md`](AI_SHOWCASE.md).

## Run it locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev      # play at the local address Vite prints
npm test         # unit tests
npm run solve    # check every level is solvable
npm run build    # production build in dist/ (serve it from any static host or a USB stick)
```

## Credits and notes

- Design, levels and code by Rajeev. AI coding assistants (including Junie) and an image generator were used during development; generated art prompts are listed in `art-prompts/`.
- All names, art and sound are original. The game is inspired by tactical shooters in general and uses no assets, names or maps from any existing game.
- Fonts: Barlow and Barlow Condensed (SIL Open Font License).
- Code licence: MIT (see `LICENSE`).
