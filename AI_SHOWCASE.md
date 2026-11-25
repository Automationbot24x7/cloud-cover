# How Cloud Cover was built with JetBrains tools

Cloud Cover is a 90-second booth game: bank a smoke canister off the walls so its cloud hides a crossing from
the watchers, then watch your squad of five run. This page is the honest story of how JetBrains tools shaped it:
what each tool did, how its work was checked, and what it caught that we would have missed.

## The loop: brief, agent, proof, review

Every agent task followed the same four steps, and every step left a file in this repository:

1. **Brief.** A written task in `.junie/tasks/` saying what to build, which files may change, and what "done"
   means. Project-wide rules live in `.junie/guidelines.md` (pure deterministic core, strict TypeScript, no new
   dependencies, tests for every core module).
2. **Agent.** Junie does the task in the project, inside WebStorm or from the command line.
3. **Proof.** The task is only done when `npm run typecheck`, `npm test` and `npm run build` pass. For level
   design, the proof is stronger: a solver tries every aim direction and power on every map (see below).
4. **Review.** A human reads the diff, plays the result, and commits it on its own, so the history shows exactly
   what each task changed (`git log --grep Junie`).

## Eight Junie tasks

| # | Task | What it proved |
|---|------|----------------|
| 001 | Simulation core: ray casts, the bouncing throw, sight-line coverage, first 41 unit tests | A pure core is easy to hand to an agent and easy to verify |
| 002 | Fixes from code review | Review found a ray and segment bound bug that made walls act longer than drawn; the fix came with regression tests |
| 003 | Booth kit: staff panel, idle reset, offline install, leaderboard tests | The booth rules (auto reset, offline, second screen) as working code |
| 004 | Network-first page caching | Review of 003 found booth laptops would never get updates; fixed |
| 005 | Fixes for WebStorm's inspection findings | Static analysis as a to-do list for the agent |
| 006 | Fair rounds | The solver found that parking the smoke on a single turret beat two maps; Junie redesigned them until the fairness tests passed |
| 007 | Twelve new maps (18 in the pool) | Creative work held to hard rules: every new map had to pass the solver's fairness tests before it counted |
| 008 | Live spectator screen, run in **JetBrains Air** | An agent session managed from WebStorm's Agent Sessions view, then reviewed and played before commit |

## JetBrains Air: the spectator screen

The organisers featured JetBrains Air this year, and it fit the next real feature: a live second screen so the
queue can watch the current run. The task brief went into `.junie/tasks/008-spectator-screen.md`; the session
was started from WebStorm's Agent Sessions view (the bundled Air plugin), where the earlier Junie sessions for
this project also appear. Record, prompt and screenshot: [`docs/jetbrains/air-session-008.md`](docs/jetbrains/air-session-008.md).

What we liked: the session list keeps every agent task for the project in one place next to the code, and the
agent's summary lists every file it touched with line counts, which made review quick. What we learned: two
sessions picked up the same prompt and ran side by side; both finished cleanly on the same files, but next time
we will start one session and watch the list.

Human review after the session: played a round with the spectator board open in a second window, checked the
board returned to its attract card after the game closed, and fixed one label.

## WebStorm: inspections as a second reviewer

WebStorm is the project's IDE. Shared run configurations are committed in `.idea/runConfigurations` (play, tests,
build, level solver). Its code inspector was also run headless over `src/`:

- **Run 1:** 22 real findings (duplicated code, dead code, invalid CSS, comment grammar). Junie task 005 fixed them.
- **Run 2:** 3 findings left, fixed directly in the editor.

Reports: `docs/inspections/`. A practical note for anyone repeating this: a crashed headless run can leave a lock
behind in the IDE's system folder; pointing the run at its own system path (`inspections/headless.properties`)
avoids it.

## The solver: proof for level design

The most useful idea in the project was making "is this map fair?" a test instead of an opinion.
`src/game/levelcheck.ts` tries every aim direction (half-degree steps) and power on a map and reports the best
cover with no bounce, one bounce and more. `tests/levels.test.ts` then requires, for every map in the pool:

- a perfect cover exists, with a power window wide enough for a fan's hand;
- from tier 3 up, a straight throw cannot do it (a bank shot is needed);
- from tier 2 up, smoke parked on a turret is never the easy answer.

This is what let an agent design twelve maps safely: it could not hand in a map that failed. The same tests
caught two of our own hand-made maps (task 006).

## By the numbers

- 8 Junie tasks, each with a written brief and its own commit; the last one run through JetBrains Air.
- 135 unit tests; 18 maps, each proven fair by the solver.
- 22 inspection findings fixed, then 3, then 0.
- 60 full runs back to back in an automated soak test, with GPU memory flat and no errors.

## Who decided what

The developer picked the concept, approved each direction (3D look, sound, map pool, spectator screen) and played
every build. Other AI coding assistants also helped outside JetBrains tools, as the README notes. Junie's part is
the eight tasks above, each traceable from brief to commit; the tests and the solver decided whether its work was
right before anything was merged.
