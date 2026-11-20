# Task 005: fix what WebStorm's code inspection found

Read `.junie/guidelines.md` first. WebStorm's inspector was run headless over `src/` with the default profile
(`inspect.bat <project> .idea/inspectionProfiles/Project_Default.xml <out> -v2 -format json -d src`).
The raw results are committed in `docs/inspections/`. Fix the real findings below and leave the noted
false positives alone. Do not change game behaviour or visuals.

1. **DuplicatedCode** (`src/board.ts` lines 22-28 and `src/game/hud.ts` lines 38-44): both build leaderboard rows.
   Move one shared `renderBoardRows(list: HTMLElement, entries: ScoreEntry[], rows: number, highlightAt?: number): void`
   into a new `src/game/boardRows.ts` and use it from both files. Keep the exact current DOM and classes
   (`pos` span, name span, score span, `me` and `empty` classes, "---" for empty rows, `en-US` number format).
   The board page currently highlights the newest entry once; keep that behaviour by passing its timestamp.
2. **JSUnusedGlobalSymbols** `clearScores` in `src/game/store.ts`: nothing uses it any more (the operator panel uses
   `clearToday`). Remove it.
3. **CssUnresolvedCustomProperty** `--grade` in `src/style.css` (`.toast`, `.toast-grade`): it is set from script.
   Give `.toast` a default `--grade: var(--blue);` so the stylesheet is valid on its own.
4. **CssInvalidPropertyValue** `src/style.css` around line 402 (`#attract` background shorthand with a gradient layer
   and an image layer): rewrite as `background-color`, `background-image` (two layers), `background-position`,
   `background-size` and `background-repeat` longhands with the same visual result.
5. **CssNoGenericFontName**: every `font-family: var(--display)` / `var(--body)` gets a generic fallback, e.g.
   `font-family: var(--display), sans-serif;`, in `src/style.css`, `src/board.css` and `src/operator.css`.
6. **GrazieInspection** grammar in comments: `src/core/geom.ts` lines 36, 51, 143, 151, 158 and `src/game/store.ts`
   lines 38, 56. Fix the wording only.
7. **JSSuspiciousNameCombination** `src/core/geom.ts` lines 130-131: this is the intentional perpendicular
   `(-y, x)`. Add a `// noinspection JSSuspiciousNameCombination` comment with a one-line reason on the line above.

Leave alone (false positives, explain nothing in code): `CssUnusedSymbol` (classes are applied from TypeScript) and
`GrazieStyle` (the project uses British spelling).

Verify with `npm run typecheck`, `npm test` and `npm run build`. Report anything you could not fix.
