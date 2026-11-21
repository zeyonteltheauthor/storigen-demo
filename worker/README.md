# grade-along-api (Cloudflare Worker)

`POST /grade` — drafts Storigen Wonders rubric scores and feedback for Grade Along. The teacher approves or edits every row.

- CORS: only `https://zeyonteltheauthor.github.io`.
- Header `X-Teacher-Passcode` must match the `TEACHER_PASSCODE` secret (constant-time compare). If unset: 503 `passcode not configured`.
- Rate limit: `RATE_LIMITER` binding, 20 requests/min per IP (in-memory fallback).
- Body: `{ firstName, grade, title?, text?, images?: [base64 JPEG, up to 3] }`.
- Response: `{ ok, model, rows: [{category, score, level, comment} x4], total, totalPossible: 20, overallFeedback, transcriptionNote, note }`.
- Model: `claude-sonnet-5-5` with structured JSON output (`output_config.format`). Override with a `MODEL` var if needed.
- No student content is logged or stored.

Secrets (never commit):

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put TEACHER_PASSCODE
npx wrangler deploy
```

Live URL: https://grade-along-api.storigen.workers.dev
