# Task 003: booth kit (operator panel, idle safety, offline install, store tests)

Read `.junie/guidelines.md` first. This game runs all day on a laptop at an esports event booth, often with
no Wi-Fi. Staff need a hidden panel to look after it, and the game must recover by itself if a fan walks away.

You may create or edit ONLY these files:

- `src/game/store.ts` (add functions; do not change the existing exported signatures)
- `src/game/operator.ts` (new)
- `src/operator.css` (new)
- `src/pwa.ts` (new)
- `public/sw.js` (new)
- `public/manifest.webmanifest` (new)
- `public/icon.svg` (new)
- `tests/store.test.ts` (new)
- `src/main.ts` (only the wiring described below, at the end of the file)
- `index.html` and `board.html` (only `<link rel="manifest">`, `<link rel="icon">` and `<meta>` tags in `<head>`)

Do NOT edit anything else under `src/game` or `src/core`. Do not add npm dependencies.

## 1. Store additions (`src/game/store.ts`)

- `clearToday(now = Date.now()): number`: remove only today's entries, keep older days; return how many were removed;
  notify listeners like `saveScore` does.
- `scoresToCsv(entries: ScoreEntry[]): string`: header `date,time,tag,score,saved,squad`, one row per entry,
  local date `YYYY-MM-DD` and time `HH:MM`, CRLF line endings, values that contain a comma or quote are quoted.
- `todayStats(now = Date.now()): { runs: number; best: number; average: number }` (average rounded to an integer, 0 when no runs).

## 2. Store tests (`tests/store.test.ts`)

The test environment is Node, which has no `localStorage` and no `BroadcastChannel`. Install minimal in-memory
stubs on `globalThis` in a `beforeEach` (a `Map`-backed `localStorage` with getItem/setItem/removeItem/clear,
and a no-op `BroadcastChannel` class with postMessage/close and an `onmessage` field; also a no-op
`window.addEventListener` / `removeEventListener` if `onScoresChanged` is tested). Cover:

- save then load returns entries best first, ties broken by the earlier time;
- `loadToday` excludes yesterday's entry;
- `saveScore` returns the 1-based rank among today's scores;
- corrupt JSON in storage loads as an empty list and does not throw;
- `clearToday` removes today only and returns the count;
- `scoresToCsv` header, row format and quoting;
- `todayStats` for zero and several runs;
- the list is capped at 500 entries, keeping the best.

## 3. Operator panel (`src/game/operator.ts`, `src/operator.css`)

Export `createOperatorPanel(actions: { resetToAttract(): void; setMuted(muted: boolean): void; isMuted(): boolean }): { toggle(): void; isOpen(): boolean }`.

- Opens and closes with **Ctrl+Shift+O** (also close with Escape). Built entirely with DOM calls, appended to `#stage`.
- Shows: today's run count, best and average score (from `todayStats`), refreshed whenever scores change (`onScoresChanged`).
- Buttons:
  - "Reset to title" -> `actions.resetToAttract()` and close the panel.
  - "Open leaderboard window" -> `window.open('board.html', 'cloudcover-board')`. Note under it: "Drag it to the second screen and press F11".
  - "Sound on / off" toggle using `setMuted` / `isMuted`.
  - "Download today's scores (CSV)" -> builds the CSV with `scoresToCsv(loadToday())` and downloads it as
    `cloud-cover-scores-YYYY-MM-DD.csv` via a Blob and a temporary `<a download>`.
  - "Clear today's board" -> requires a second click within 3 seconds on the same button, whose label changes to
    "Click again to clear"; then `clearToday()`.
- While the panel is open, game pointer input must not reach the canvas (the panel covers the stage with a dark backdrop).
- Style it in `src/operator.css` with the CSS variables already defined in `src/style.css` (`--navy-800`, `--white`,
  `--muted`, `--blue`, `--coral`, `--display`, `--body`, and `--u` for sizes, e.g. `calc(var(--u) * 24)`).
  Square-ish panel centred on the stage, title "OPERATOR", clear spacing, buttons in the same skewed style as `.cta`.

## 4. Idle safety (wiring in `src/main.ts`)

- Import `./operator.css`, `createOperatorPanel` and `setMuted`, `isMuted` from `./game/audio`.
- Create the panel with `resetToAttract: () => { game.reset(); hud.showAttract(); }`.
- Keydown: Ctrl+Shift+O toggles the panel (and `preventDefault`), otherwise keys go to `hud.key` as now.
- Idle watchdog: track the time of the last pointer or key input. If more than 45 seconds pass with no input while
  `game.state.phase` is one of `intro`, `aim`, `flight`, `reveal`, `result`, call the same reset as above.
  (The summary screen already has its own timeout; leave it alone.)

## 5. Offline install (`public/sw.js`, `public/manifest.webmanifest`, `public/icon.svg`, `src/pwa.ts`)

- `public/icon.svg`: a simple original cloud shape, white on `#19a7ff` rounded square. No text, no logos.
- `public/manifest.webmanifest`: name "Cloud Cover", short_name "Cloud Cover", display "fullscreen",
  background and theme colour `#06122a`, start_url "./", scope "./", icon `icon.svg` (sizes "any", type image/svg+xml).
- `public/sw.js`: versioned cache name `cloudcover-v1`. On install, cache `./`, `./index.html`, `./board.html`,
  `./manifest.webmanifest`, `./icon.svg` and call `skipWaiting`. On activate, delete other `cloudcover-*` caches and
  `clients.claim()`. On fetch (GET, same origin only): cache-first, and on a network success store a copy in the cache
  (this is how the hashed JS, CSS and font files get cached after the first load). Navigations fall back to the cached
  `./index.html` when offline. Relative paths only, because the game is served from a sub-folder on GitHub Pages.
- `src/pwa.ts`: export `registerServiceWorker(): void` that registers `./sw.js` only when
  `import.meta.env.PROD` and `'serviceWorker' in navigator`, and swallows errors. Call it from `src/main.ts` and also
  import and call it in `src/board.ts`? NO: only from `src/main.ts`.

## Verify

Run `npm run typecheck`, `npm test` and `npm run build`. All three must pass. Report what you could not verify.
