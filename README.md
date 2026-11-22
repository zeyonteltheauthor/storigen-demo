# STORIGEN OS — demo

STORIGEN OS demo: turn any idea into visible thinking through Seven Lenses. Human first. AI assists. The learner decides. By Arrival House Media.

**Live:** https://zeyonteltheauthor.github.io/storigen-demo/

Type an idea, answer the Seven Lenses (Character, Goal, Obstacle, Stakes, Perspective, World, Twist), and watch your thinking become a map, then a story spine built only from your own words.

- Static HTML/CSS/JS: no build step, no login, no API key, works offline.
- Run locally: open `index.html`, or `python3 -m http.server` in this folder.
- Hosted with GitHub Pages (Deploy from branch: `main`, folder `/ (root)`).
- Grade Along lives at `grade-along/`: fictional practice samples, plus a **Grade a paper** mode where Grade Along AI drafts each rubric row and the teacher approves or edits it. Real student papers are not in this repository.

## Grade Along AI drafts

**Private:** the Grade Along page opens on a passcode gate. The app markup sits in a `<template>` and its code runs only after the Worker's `POST /verify` accepts the teacher passcode (kept in sessionStorage for the tab; **Lock** clears it). Static hosting cannot hide source, but without the passcode nothing renders or works, and the Worker refuses grading. No student data ships in the page; drafts stay in the teacher's browser.

In **Grade a paper** (`grade-along/?mode=grade`), the teacher enters the passcode and presses **Grade with AI**. The page resizes up to 3 photos to JPEG (max 1568 px), or turns the ticked pages of a scanned PDF into JPEGs on the device with vendored pdf.js (`grade-along/vendor/pdfjs/`; the PDF itself is never sent), and sends them, and/or the typed story text, with the first name and grade to the `grade-along-api` Cloudflare Worker (`worker/`). The Worker checks the teacher passcode, rate-limits, and asks Claude (`claude-sonnet-5-5`) for structured JSON: a 1–5 level and comment for each of the four Storigen Wonders rubric rows, overall feedback, and a reading note. Each row appears as an **AI draft** that the teacher approves or edits; **Approve review** unlocks only after every row and the overall feedback are reviewed. AI drafts, teacher decides.

- **Several students in one session:** the Students bar adds a student per paper (name, grade, date, facilitator, up to 3 photos or PDF pages each). **Grade with AI** drafts the student on screen; **Grade all with AI** drafts every ungraded student one at a time (spaced to stay under the Worker's 20/minute limit) with progress shown. Click a student to review and approve their rows. The queue is kept in this browser; paper photos are dropped from storage (with a warning) when they are too large to keep.
- **Bulk upload (one file per student):** pick or drop a stack of scanned PDFs or photos on the Students bar (or pick 2+ PDFs in the paper upload and answer yes to *Make each file its own student?*). Each file becomes a student named from the file name (editable); grade, date, and facilitator are copied from the student on screen. In a multi-page PDF, page 1 is treated as the STORIGEN cover sheet and skipped, and the next pages (up to 3) are ticked, with a note to check. A **Grade all with AI** button appears right there. Page thumbnails are drawn only for the student on screen and full-size page pictures only while grading, so about 30 files stay light.
- **Split a class scan:** a PDF with more than 3 pages gets a **Split this scan into students** button (also offered in the bulk panel). The page renders small page pictures on the device and the Worker's `POST /split` says which pages are cover sheets (batches of 20). Each cover starts a student whose pages run to the next cover; the teacher can tap pages to move split points, or use **Split every N pages** (default 2) if detection fails. Each new student gets its cover marked and story pages ticked, and covers are read right away so names replace the file name.
- **Pre/post writing growth:** each session is marked **Pre-writing** or **Post-writing** (with a per-student override), and the label shows on queue chips and score reports. **Save class scores** downloads a small JSON file to the teacher's device with first name, grade, facilitator, date, assessment, the 4 row scores and the total. It holds no story text or images. Approved scores are also kept in this browser's localStorage, on this device only. In a later post session, **Load pre scores** (JSON, or the Download CSV file) matches students by first name plus grade, case-insensitive. A dropdown fixes mismatches, and unmatched students are flagged. A matched post report adds a Pre vs Post table, and **Print class growth** prints a one-page class summary with pre total, post total and change per student, plus the class average per rubric row. Nothing is stored on a server.
- **Details from the cover sheet:** when a PDF has a cover sheet, Grade Along can send a picture of page 1 to the Worker as `coverImage`. The Worker reads only the first name, grade, facilitator, and date (no last name, no school) and keeps it out of the grading prompt and the score. Filled fields are marked *from cover · check*; anything the teacher types wins. **Grade all** reads each cover just before grading that student; **Read covers only** fills details without grading.
- **Reports:** **Print report** prints a one-page US Letter score report for the student on screen (scores table with full comments and review status, total out of 20, overall feedback); the type shrinks to fit one page. **Print all approved** prints one page per approved student. **Download CSV** gives one row per student.

- Nothing else leaves the device. Drafts can be kept in this browser (localStorage); the passcode is kept for the tab only (sessionStorage). The page CSP allows network calls to the Worker only.
- The Worker stores nothing and does not log student content. Secrets live only in Cloudflare (`ANTHROPIC_API_KEY`, `TEACHER_PASSCODE`), never in this repo. Deploy with `cd worker && npx wrangler deploy`; set secrets with `npx wrangler secret put <NAME>` or in the Cloudflare dashboard.


## Works offline

After one visit over http(s), the app runs with no network. `sw.js` precaches the page, styles, scripts, fonts, manifest, and icons using relative paths (so it works at `/storigen-demo/`), then serves static assets cache-first and pages (navigations and `.html`) network-first, falling back to the cache offline, so an open tab always gets the newest page. It deletes older caches on activate. When a new version takes control of an open tab, the page reloads once (guarded against loops). Bump `CACHE` in `sw.js` and the **Grade Along vN** label in the teacher footer on each release. `manifest.webmanifest` makes it installable: name STORIGEN OS, short name STORIGEN, standalone display, ink `#1F2937` and parchment `#F7F4EC`. Icons are a lantern-gold `#D1A954` S on ink.

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
