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
