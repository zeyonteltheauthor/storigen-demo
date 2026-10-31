# STORIGEN OS — demo

STORIGEN OS demo: turn any idea into visible thinking through Seven Lenses. Human first. AI assists. The learner decides. By Arrival House Media.

**Live:** https://zeyonteltheauthor.github.io/storigen-demo/

Type an idea, answer the Seven Lenses (Character, Goal, Obstacle, Stakes, Perspective, World, Twist), and watch your thinking become a map, then a story spine built only from your own words.

- Static HTML/CSS/JS: no build step, no login, no API key, works offline.
- Run locally: open `index.html`, or `python3 -m http.server` in this folder.
- Hosted with GitHub Pages (Deploy from branch: `main`, folder `/ (root)`).

## Works offline

After one visit over http(s), the app runs with no network. `sw.js` precaches the page, styles, scripts, fonts, manifest, and icons using relative paths (so it works at `/storigen-demo/`), then serves them cache-first from a versioned cache and deletes older caches on activate. `manifest.webmanifest` makes it installable: name STORIGEN OS, short name STORIGEN, standalone display, ink `#1F2937` and parchment `#F7F4EC`. Icons are a lantern-gold `#D1A954` S on ink.

A service worker only registers on http(s), including this folder on a local static server or on GitHub Pages. Opening `index.html` as a file still runs the app; it just cannot install the worker.

## Tests

The Playwright suite lives in `test/`. Serve the repo root, then point the suite at it with `BASE`:

```bash
cd test && npm ci && npx playwright install chromium
cd ..
python3 -m http.server 4173
BASE=http://127.0.0.1:4173/ node test/run.js
node test/pages-smoke.js http://127.0.0.1:4173/
```

`run.js` walks the lens flows and includes an offline check: load the page, `context.setOffline(true)`, reload, and finish a lens flow. `pages-smoke.js` loads the served site and walks one full example through the story reveal. `.github/workflows/tests.yml` installs Playwright and Chromium, serves this repo, and runs both on every push.
