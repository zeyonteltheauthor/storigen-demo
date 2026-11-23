# grade-along-api (Cloudflare Worker)

Live URL: https://grade-along-api.storigen.workers.dev

CORS: only `https://zeyonteltheauthor.github.io`. Rate limit: `RATE_LIMITER` binding, 20 requests/min per IP (in-memory fallback). Model: `claude-sonnet-5-5`.

Auth, either:
- Header `X-Teacher-Passcode` matching the `TEACHER_PASSCODE` secret (passcode mode, unchanged from v12). Or
- Header `X-Teacher-Session` for a school session from a redeemed invite.

`POST /verify` — passcode or session. Passcode returns `{ ok, mode: "passcode" }`. School session returns `{ ok, mode: "school", user, school, usage, rubrics }`. 401 otherwise.

`POST /grade`, `POST /split`, `POST /rubric` — same bodies as v12. Both auth modes work. `/split` and `/rubric` do not count against the paper pool. `/grade` counts one paper per graded student in school mode (cover-only reads do not count), warns at 80% of the yearly cap (`usageNote`), and stops at 100%. Passcode mode has no cap and stores nothing. In school mode, a teacher whose school has not allowed personal rubrics must send an approved school rubric on `/grade`.
- `POST /split` returns `{ covers, pages: [{ n, kind }] }` where kind is `cover`, `story`, or `blank`. Only `cover` pages start a student. Story pages with Name/Title lines are not covers.

School accounts (D1 binding `DB`, database `grade-along-db`):
- `POST /auth/redeem` `{ email, code }` → `{ ok, token, user, school, usage, rubrics }`. The invite is one-time and expires in 14 days.
- `POST /auth/logout` — ends this session.
- `GET` / `POST /owner/schools` — Arrival House only (passcode). Create a school and first admin (returns `inviteCode` once), list schools, or update a cap/status.
- `GET /school` — current user, usage, school rubrics; admins also get the teacher list.
- `POST /school/teachers` — admin adds or reactivates a teacher; returns `inviteCode` once.
- `POST /school/teachers/remove` `{ teacherId }` — sets inactive and deletes sessions immediately.
- `POST /school/settings` `{ teachersOwnRubrics }` — admin. When false (the default), teachers may only grade with a school rubric.
- `POST /school/allowance` — rejected; only Arrival House can change the paper cap, via `POST /owner/schools` `{ schoolId, paperAllowance }`.
- `POST /school/rubrics` and `POST /school/rubrics/delete` — admin shared rubrics (same shape as `/rubric`).
- `POST /school/scores` — first name, grade, facilitator, date, pre/post, rubric id/name, scores, total, outOf only. No story text.
- `GET /school/report` — admin growth report by grade and by class.

Nothing logs student content. Photos, PDFs and story text are never stored. Invites and sessions are stored as HMAC hashes under `SESSION_SECRET`.

Secrets (never commit):

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put TEACHER_PASSCODE
npx wrangler secret put SESSION_SECRET
npx wrangler deploy
```


## Retention (v23)

Owner-only (teacher passcode) endpoints:

- `POST /owner/schools/close` `{schoolId}`: status `closed`, `closed_at` now, `delete_after` now + 30 days; deletes the school's sessions and unused invites (everyone is signed out). Closed schools cannot sign in or grade.
- `POST /owner/schools/reopen` `{schoolId}`: clears the dates and sets the school to `paused`.
- `GET /owner/schools/export?schoolId=…`: `{filename, rows, csv}` with the school's saved scores (formula-safe CSV).
- `POST /owner/schools/delete` `{schoolId, confirmName}`: only for a closed school, and only when `confirmName` matches the school name (case and spacing ignored). Deletes scores, usage_events, rubrics, answer_keys, sessions, invites, teachers and the school row in one batch, and writes a `school_deletions` record (id, school id and name, closed/deleted times, method `owner_now` or `scheduled`, row counts). No student data is kept in the record.
- `GET /owner/deletions`: the deletion records. `GET /owner/schools` also returns them as `deletions`.

Cron trigger `0 8 * * *` (`scheduled`): deletes data for closed schools whose `delete_after` has passed (method `scheduled`), expired sessions, and expired unused invites. Redeemed invites stay until their school's data is deleted. It logs only counts.

Schema changes are additive: `ALTER TABLE schools ADD COLUMN closed_at TEXT`, `ADD COLUMN delete_after TEXT`, and `CREATE TABLE IF NOT EXISTS school_deletions`. The Worker applies them on first use if missing. D1 Time Travel can still restore deleted rows for up to 30 days (Workers Paid) — that is Cloudflare's backup window, not something the app reads.

Tests: `node test/grade-along-retention.test.mjs` (Worker + fake D1 on `node:sqlite`) and `node test/grade-along-retention-e2e.cjs` (page + Worker through Playwright; serve the repo at http://127.0.0.1:4173 first).

## v24: names, approved scores, paper credits

- `src/index.js` is the entry and exports only the default handler (newer workerd rejects extra named exports such as `DEMO_DAILY_LIMIT`). All code and the helpers used by tests live in `src/app.js`.
- **First name only.** `cleanFirstName()` keeps the first given name (`"Testy Mae Brown"` and `"Brown, Testy Mae"` give `Testy`) for `/grade`, `/demo/grade`, cover reads, `/test/read`, `/school/scores`, the school report and CSV export (legacy rows included). Writing prompts add a rule to use the first name only, and `scrubDraftNames()` removes a middle/last name the model copied from the paper.
- **`/school/scores`** requires `approved: true` (400 `notApproved` otherwise). Optional `lastInitial` (one letter, teacher-typed) and `rosterId` (browser roster key) are part of the upsert key, so same-name students never overwrite each other. The report pairs pre/post by first name + last initial + grade and flags `sameName` instead of pairing when two records share that key. (Fixes a v23 bug where every student in a grade shared one pairing key.)
- **Credits.** `/test/read` and `/demo/test/read` return 422 `noAnswers` without charging when nothing is clearly marked. `usage_events.paper_key` (SHA-256 of kind + first name + first page) makes a retry/regrade of the same paper within 24 hours free; the daily cron clears paper keys older than 24 hours.
- Schema changes are additive (`scores.last_initial`, `scores.roster_id`, `scores.approved`, `usage_events.paper_key`, index `usage_paper`) and are applied on first use.
- Tests: `node test/grade-along-v24.test.mjs` and `node test/grade-along-v24-e2e.cjs` (static server on 127.0.0.1:4173).

## Invite emails (v16)

- `POST /owner/schools` and `POST /school/teachers` send an invite email when the `EMAIL` binding is configured, and always return the one-time `inviteCode` plus `email: { sent, error }`.
- `POST /school/teachers/resend` (school admin) and `POST /owner/schools/resend` (Arrival House passcode) issue a new code, invalidate the previous unused code, and email it.
- Configurable vars: `INVITE_FROM` (default `invites@gradealong.com`), `INVITE_FROM_NAME`, `INVITE_REPLY_TO` (default `info@arrivalhousemedia.com`), `INVITE_SIGNIN_URL`.
- Emails never include student names, papers or scores.
- CORS allows `https://zeyonteltheauthor.github.io`, `https://gradealong.com` and `https://www.gradealong.com`.


## Public demo (`POST /demo/grade`)
Unauthenticated. Reuses the existing RATE_LIMITER with a `demo:` key prefix and caps 10 papers per IP per calendar day (America/New_York) via the Cache API (a count only — never the paper). Same body shape as `/grade` (text and/or photos, optional rubric). No session, no D1 writes, no school usage consumption. CORS matches the other routes.


## Feedback language
`POST /grade` and `POST /demo/grade` accept `feedbackLanguage`: `en` (default), `es`, or `paper`. Row comments, overall feedback, and summaries are written in that language regardless of the paper. When the paper’s language differs, the draft may also include `storySummary`, `studentFacingFeedback`, and `paperLanguage`. Quoted phrases from the paper stay in the original, with a gloss in the feedback language.

## v25: roster-key growth pairing and flag-a-bad-result credits

- **School report and on-device growth** pair a student's pre- and post-writes by `roster_id` when both records have one. Different roster keys never merge. Legacy rows with no roster key still fall back to first name + last initial + grade; when that fallback is ambiguous they stay unpaired and are flagged `sameName`.
- **`POST /school/usage/flag`:** a school teacher flags a charged draft or test read (`usageId` plus `reason`: `wrong_student`, `misread_page`, `garbled_text`, or `other`). The credit is restored once, only for that teacher's own `usage_events` row, up to 5 restores per teacher per calendar month (UTC). Over the cap, the flag is still stored (`restored = 0`) and the response explains why. Additive table `credit_flags` is created on first use and deleted with the school.
- A successful `/grade` or `/test/read` that used a credit returns `usageId` so the page can offer **Flag bad result**. Free 24-hour retries do not return a new `usageId`.
- Tests: `node test/grade-along-v28.test.mjs` and `node test/grade-along-v28-e2e.cjs` (static server on 127.0.0.1:4173).

## v26: site-only sample photo fix

- The API Worker is unchanged from v25. The Grade Along page and the `grade-along-web` site Worker now resolve sample photos correctly when the public demo is shown at `/` or `/demo`, clear photos when the sample changes, and drop undecodable photos instead of blocking grading.
- Tests: `node test/grade-along-v28.test.mjs` and `node test/grade-along-v28-e2e.cjs` (static server on 127.0.0.1:4173).

## v28: per-network cap wording and fictional-samples warning

- The public demo cap is still 10 papers or tests per IP address per America/New_York calendar day. Page and Worker copy now say the cap is shared per network, in English and Spanish. The phrase “nothing is stored on the server” is removed from the demo; the page now says to use fictional samples only and not to upload real student work.
- Tests: `node test/grade-along-v28.test.mjs` and `node test/grade-along-v28-e2e.cjs` (static server on 127.0.0.1:4173).

## v27: sample photos are not persisted

- The API Worker raises the public demo cap from 3 to 10 papers per IP per calendar day (America/New_York). The Grade Along page no longer saves practice-sample photos in the browser, and it drops any that were saved by an earlier release, so a reload of the public demo cannot attach the Science Check image to a different sample.
- Tests: `node test/grade-along-v28.test.mjs` and `node test/grade-along-v28-e2e.cjs` (static server on 127.0.0.1:4173).
