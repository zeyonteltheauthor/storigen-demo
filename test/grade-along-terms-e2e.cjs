// v30: public teacher Terms page loads, is static (no scripts, no API calls), and carries the agreed terms.
const { chromium } = require("playwright");
const assert = require("assert/strict");
const BASE = process.env.BASE || "http://127.0.0.1:4173/grade-along/";
let n = 0; const ok = (name, c) => { assert.ok(c, name); n++; console.log("PASS", name); };
(async () => {
  const b = await chromium.launch(); const page = await b.newPage(); const reqs = [];
  page.on("request", r => reqs.push(r.url()));
  const res = await page.goto(BASE + "terms/");
  ok("terms: 200", res.status() === 200);
  const t = await page.locator("body").innerText();
  ok("terms: title", /Grade Along Teacher Plan Terms/.test(await page.locator("h1").innerText()));
  ok("terms: prices", /\$15 a month/.test(t) && /\$144 a year/.test(t) && /\$199 a year/.test(t));
  ok("terms: renewal reminder before every yearly renewal", /reminder email/i.test(t) && /every renewal of a yearly plan/i.test(t));
  ok("terms: 30-day price notice", /at least 30 days before/i.test(t));
  ok("terms: refund rule", /full refund within 14 days/i.test(t) && /not refundable/i.test(t));
  ok("terms: no draft/pending/counsel/legal-advice markers", !/\b(DRAFT|PENDING|COUNSEL)\b/.test(t) && !/legal advice|for review/i.test(t));
  ok("terms: no scripts", (await page.locator("script").count()) === 0);
  ok("terms: no outside requests", reqs.every(u => u.startsWith(new URL(BASE).origin)));
  ok("terms: links back to teacher page", (await page.locator('a[href="../teacher/"]').count()) === 1);
  await b.close(); console.log(`ALL ${n} PASS`);
})().catch(e => { console.error("FAIL", e.message); process.exit(1); });
