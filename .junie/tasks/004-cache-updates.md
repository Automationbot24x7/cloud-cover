# Task 004: let updates reach booth laptops (review fix for task 003)

Read `.junie/guidelines.md` first. Only edit `public/sw.js`.

Review finding: `public/sw.js` answers every GET cache-first, including the HTML pages. Once a laptop has the
game cached, it never sees a new version: after we publish a fix, the booth (and any judge who visited before)
keeps running the old `index.html`, which points at the old hashed bundles.

Change the fetch strategy:

- **Navigations and `.html` / `.webmanifest` requests: network-first.** Try the network with a 3-second timeout;
  on success update the cache and return the fresh response; on failure or timeout return the cached copy
  (for navigations fall back to `./index.html`, or `./board.html` when the URL path ends in `board.html`).
- **Everything else (hashed JS, CSS, fonts, images): cache-first**, as now.
- Bump the cache name to `cloudcover-v2` so the old cache is cleaned up on activate.
- Keep the install-time precache of the pages and the assets they reference.

Explain the strategy in a short comment at the top of the file. You cannot unit-test a service worker here;
instead run `npm run build` and confirm `dist/sw.js` contains the new logic, and report that.
