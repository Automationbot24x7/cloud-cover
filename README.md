# Cloud Cover

**Bank the smoke. Hide the crossing. Save the squad.**

A 90-second mini game for an esports event booth. Point, hold to power up, release: the smoke canister banks off the walls like a pool ball and blooms into a cloud. Every sight line the cloud cuts between the watchers and the crossing is one your squad runs through unseen.

**Play it:** https://automationbot24x7.github.io/cloud-cover/ (mouse or touch, works offline after the first visit)
**Booth leaderboard screen:** https://automationbot24x7.github.io/cloud-cover/board.html

Built for the Cloud9 x JetBrains *Sky's The Limit* Hackathon 2026, Category 3: Event Mini Game.

## Why this game

Fans in a booth line have a minute or two, no tutorial and one hand on a mouse. Most booth games test raw reflexes. Cloud Cover tests something competitive players actually practise and rarely get to show off: **reading angles**, bouncing utility off geometry to deny an opponent's line of sight.

- **One control.** Aim, hold, release. The power line runs out along the real bounce path and the landing ring shows where it will bloom.
- **Instant cause and effect.** While you charge, the watchers' red view of the crossing shrinks live and a "% hidden" readout tells you how good the throw is before you let go.
- **A short, readable story per throw.** The cloud blooms, sight lines sweep in (green blocked, red open), "GO!", and your five-person squad runs. Anyone a watcher can still see is spotted.
- **Six rounds, about 90 seconds**, rising from a straight drop to bank shots off slanted walls with only the first bounce shown.

## Booth-ready

- **Attract screen** with today's top five, and an automatic return to it after each run or 45 seconds without input.
- **Second-screen leaderboard** (`board.html`): open it in a second window, drag it to the other monitor, press F11. It updates the instant a score is saved, on the same machine, with no network.
- **Works offline** once loaded (installable web app with a service worker). Scores are stored locally.
- **Hidden staff panel: Ctrl+Shift+O.** Today's runs, best and average; reset to title; open the leaderboard window; sound on/off; download today's scores as CSV; clear today's board (two clicks).
- **Three-letter tag entry** by mouse or keyboard, with a rank title for the run.

## How it works

- `src/core/`: pure, deterministic TypeScript. Ray casting against wall segments, the bouncing throw path, and sight-line coverage (`watchers x 24 points along the crossing`, each line classed as blocked by a wall, blocked by the cloud, or open). Score = cloud-blocked lines / (cloud-blocked + open).
- `src/game/`: state machine, levels, canvas rendering, synthesised Web Audio sound, HUD, local leaderboard and the staff panel.
- `tools/solve.ts`: a level checker that tries every direction and power for each round and reports the best possible cover with 0, 1 and 2+ bounces, so every round is proven solvable (and rounds 3 to 6 provably need a bank).

## Built with JetBrains tools

- **WebStorm** is the project's IDE. Shared run configurations are committed in `.idea/runConfigurations` (play, unit tests, build, level solver).
- **Junie** did real, reviewable pieces of the build from written briefs, each committed on its own. The briefs are in `.junie/tasks/` and the project rules in `.junie/guidelines.md`:
  1. the simulation core and its first 41 unit tests,
  2. fixes after code review (a ray/segment bound bug that made walls act longer than drawn) plus regression tests,
  3. the booth kit (staff panel, idle reset, offline install, leaderboard tests),
  4. network-first page caching so updates reach booth laptops,
  5. fixes for WebStorm's inspection findings.
- **WebStorm's code inspector**, run headless over `src/`, found 22 real issues (duplicated code, dead code, invalid CSS, grammar); after the fixes a second run found 3, which were then fixed. Results: `docs/inspections/`.

A longer write-up of the JetBrains workflow is in `AI_SHOWCASE.md` (coming).

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
