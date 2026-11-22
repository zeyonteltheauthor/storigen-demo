# STORIGEN OS — demo

STORIGEN OS demo: turn any idea into visible thinking through Seven Lenses. Human first. AI assists. The learner decides. By Arrival House Media.

**Live:** https://zeyonteltheauthor.github.io/storigen-demo/

Type an idea, answer the Seven Lenses (Character, Goal, Obstacle, Stakes, Perspective, World, Twist), and watch your thinking become a map, then a story spine built only from your own words.

- Static HTML/CSS/JS: no build step, no login, no API key, works offline.
- Run locally: open `index.html`, or `python3 -m http.server` in this folder.
- Hosted with GitHub Pages (Deploy from branch: `main`, folder `/ (root)`).
- Grade Along lives at `grade-along/`: fictional practice samples, plus a **Grade a paper** mode where Grade Along AI drafts each rubric row and the teacher approves or edits it. Real student papers are not in this repository.

## Grade Along AI drafts

In **Grade a paper** (`grade-along/?mode=grade`), the teacher enters the passcode and presses **Grade with AI**. The page resizes up to 3 photos to JPEG (max 1568 px), or turns the ticked pages of a scanned PDF into JPEGs on the device with vendored pdf.js (`grade-along/vendor/pdfjs/`; the PDF itself is never sent), and sends them, and/or the typed story text, with the first name and grade to the `grade-along-api` Cloudflare Worker (`worker/`). The Worker checks the teacher passcode, rate-limits, and asks Claude (`claude-sonnet-5-5`) for structured JSON: a 1–5 level and comment for each of the four Storigen Wonders rubric rows, overall feedback, and a reading note. Each row appears as an **AI draft** that the teacher approves or edits; **Approve review** unlocks only after every row and the overall feedback are reviewed. AI drafts, teacher decides.

- **Several students in one session:** the Students bar adds a student per paper (name, grade, date, facilitator, up to 3 photos or PDF pages each). **Grade with AI** drafts the student on screen; **Grade all with AI** drafts every ungraded student one at a time (spaced to stay under the Worker's 20/minute limit) with progress shown. Click a student to review and approve their rows. The queue is kept in this browser; paper photos are dropped from storage (with a warning) when they are too large to keep.
- **Bulk upload (one file per student):** pick or drop a stack of scanned PDFs or photos on the Students bar (or pick 2+ PDFs in the paper upload and answer yes to *Make each file its own student?*). Each file becomes a student named from the file name (editable); grade, date, and facilitator are copied from the student on screen. In a multi-page PDF, page 1 is treated as the STORIGEN cover sheet and skipped, and the next pages (up to 3) are ticked, with a note to check. A **Grade all with AI** button appears right there. Page thumbnails are drawn only for the student on screen and full-size page pictures only while grading, so about 30 files stay light.
- **Details from the cover sheet:** when a PDF has a cover sheet, Grade Along can send a picture of page 1 to the Worker as `coverImage`. The Worker reads only the first name, grade, facilitator, and date (no last name, no school) and keeps it out of the grading prompt and the score. Filled fields are marked *from cover · check*; anything the teacher types wins. **Grade all** reads each cover just before grading that student; **Read covers only** fills details without grading.
- **Reports:** **Print report** prints a one-page US Letter score report for the student on screen (scores table with full comments and review status, total out of 20, overall feedback); the type shrinks to fit one page. **Print all approved** prints one page per approved student. **Download CSV** gives one row per student.

- Nothing else leaves the device. Drafts can be kept in this browser (localStorage); the passcode is kept for the tab only (sessionStorage). The page CSP allows network calls to the Worker only.
- The Worker stores nothing and does not log student content. Secrets live only in Cloudflare (`ANTHROPIC_API_KEY`, `TEACHER_PASSCODE`), never in this repo. Deploy with `cd worker && npx wrangler deploy`; set secrets with `npx wrangler secret put <NAME>` or in the Cloudflare dashboard.


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
