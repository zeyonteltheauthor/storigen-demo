// v30 browser checks: teacher-plans page + main app with an individual session. Real pages + real Worker (fake D1),
// Stripe and the AI mocked in-process. Fictional data only. Needs: python3 -m http.server 4173 --directory <repo root>
const { chromium } = require("playwright");
const { DatabaseSync } = require("node:sqlite");
const fs = require("fs"), path = require("path");
const assert = require("assert/strict");
const BASE = "http://127.0.0.1:4173/grade-along/";
let n = 0; const ok = (name, c) => { assert.ok(c, name); n++; console.log("PASS", name); };
if (!crypto.subtle.timingSafeEqual) crypto.subtle.timingSafeEqual = (a, b) => { const x = new Uint8Array(a), y = new Uint8Array(b); if (x.length !== y.length) return false; let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i]; return d === 0; };
function makeD1(db) {
  const wrap = (sql, params = []) => ({
    bind: (...p) => wrap(sql, p),
    async first() { const st = db.prepare(sql); if (/returning/i.test(sql)) return st.all(...params)[0] ?? null; return st.get(...params) ?? null; },
    async all() { return { results: db.prepare(sql).all(...params) }; },
    async run() { const st = db.prepare(sql); if (/^\s*(select|pragma)/i.test(sql) || /returning/i.test(sql)) return { results: st.all(...params), meta: { changes: 0 } }; const r = st.run(...params); return { meta: { changes: Number(r.changes) } }; }
  });
  return { prepare: (sql) => wrap(sql), async exec(sql) { db.exec(sql); }, async batch(stmts) { for (const s of stmts) await s.run(); } };
}
(async () => {
  const worker = (await import(require("url").pathToFileURL(path.join(__dirname, "../worker/src/index.js")).href)).default;
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(path.join(__dirname, "fixtures/schema-v22.sql"), "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const env = { DB: makeD1(db), SESSION_SECRET: "s".repeat(32), ANTHROPIC_API_KEY: "test-not-a-key",
    STRIPE_MODE: "test", STRIPE_SECRET_KEY: "rk_test_e2e", STRIPE_WEBHOOK_SECRET: "whsec_e2e_only", STRIPE_PRICE_MONTHLY: "price_m", STRIPE_PRICE_YEARLY: "price_y", STRIPE_PRICE_YEARLY_PLUS: "price_yp",
    PLAN_PAPERS_MONTHLY: "30", PLAN_PAPERS_YEARLY: "360", PLAN_PAPERS_YEARLY_PLUS: "480", TEACHER_PAGE_URL: BASE + "teacher/" };
  const inert = { DB: env.DB, SESSION_SECRET: env.SESSION_SECRET, ANTHROPIC_API_KEY: "x" };
  let useEnv = inert;
  const sessions = {}; let checkoutBody = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    const reply = (o) => new Response(JSON.stringify({ livemode: false, ...o }), { status: 200 });
    if (url.startsWith("https://api.anthropic.com")) {
      const out = { lenses: { score: 3, comment: "Vivid." }, organization: { score: 3, comment: "Clear." }, development: { score: 3, comment: "Good." }, conventions: { score: 3, comment: "Ok." }, overallFeedback: "Nice work.", transcriptionNote: "" };
      return new Response(JSON.stringify({ model: "m", content: [{ type: "text", text: JSON.stringify(out) }], usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200 });
    }
    if (url.startsWith("https://api.stripe.com")) {
      const u = new URL(url), p = u.pathname, body = new URLSearchParams(init.body || "");
      if (p === "/v1/customers") return reply({ id: "cus_e2e" });
      if (p === "/v1/checkout/sessions" && init.method === "POST") { checkoutBody = body; sessions.cs_test_e2e = { id: "cs_test_e2e", customer: "cus_e2e", client_reference_id: body.get("client_reference_id"), status: "complete", payment_status: "paid", subscription: "sub_e2e", invoice: "in_e2e", mode: "subscription" }; return reply({ id: "cs_test_e2e", url: "https://checkout.stripe.test/c/pay/cs_test_e2e" }); }
      if (p === "/v1/checkout/sessions/cs_test_e2e") return reply(sessions.cs_test_e2e);
      if (p === "/v1/subscriptions/sub_e2e") return reply({ object: "subscription", id: "sub_e2e", customer: "cus_e2e", status: "active", metadata: { account_id: sessions.cs_test_e2e.client_reference_id }, items: { data: [{ price: { id: "price_m" }, current_period_start: now - 60, current_period_end: now + 30 * 86400 }] } });
      if (p === "/v1/invoices/in_e2e") return reply({ object: "invoice", id: "in_e2e", status: "paid", billing_reason: "subscription_create", customer: "cus_e2e", amount_paid: 1500, parent: { subscription_details: { subscription: "sub_e2e" } }, lines: { data: [{ amount: 1500, pricing: { price_details: { price: "price_m" } }, period: { start: now - 60, end: now + 30 * 86400 } }] } });
      if (p === "/v1/billing_portal/sessions") return reply({ url: "https://billing.stripe.test/p/session/x" });
      return new Response(JSON.stringify({ error: { type: "invalid_request_error" } }), { status: 404 });
    }
    return realFetch(url, init);
  };
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  let ip = 0;
  await ctx.route("https://grade-along-api.storigen.workers.dev/**", async (route) => {
    const r = route.request();
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, X-Teacher-Passcode, X-Teacher-Session", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
    if (r.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const req = new Request(r.url(), { method: r.method(), headers: { ...r.headers(), origin: "https://gradealong.com", "cf-connecting-ip": "10.7.7." + (++ip % 250) }, body: ["GET", "HEAD"].includes(r.method()) ? undefined : r.postData() });
    const res = await worker.fetch(req, useEnv);
    return route.fulfill({ status: res.status, headers: { "Content-Type": "application/json", ...cors }, body: await res.text() });
  });
  await ctx.route("https://checkout.stripe.test/**", (route) => route.fulfill({ status: 302, headers: { Location: BASE + "teacher/?session_id=cs_test_e2e" } }));
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));

  // 1. inert (production today)
  await page.goto(BASE + "teacher/");
  await page.waitForFunction(() => !document.getElementById("soon").hidden || !document.getElementById("buybox").hidden);
  ok("inert: teacher page says coming soon, no Buy button", await page.locator("#soon").isVisible() && !(await page.locator("#buy").isVisible()));
  await page.goto(BASE); await page.waitForTimeout(800);
  ok("inert: gate hides the teacher-plans link", !(await page.locator("#gate-plans").isVisible()));
  ok("inert: no individual tables created", !db.prepare("SELECT name FROM sqlite_master WHERE name='individual_accounts'").get());

  // 2. billing on (test mode)
  useEnv = env;
  await page.goto(BASE); await page.waitForTimeout(800);
  ok("on: gate shows the teacher-plans link", await page.locator("#gate-plans").isVisible());
  await page.goto(BASE + "teacher/");
  await page.waitForSelector("#buy", { state: "visible" });
  const disc = await page.locator("#renewal").innerText();
  ok("on: Buy shown with auto-renewal disclosure", /renews automatically/i.test(disc) && /cancel anytime/i.test(disc) && /tax may be added/i.test(disc));
  ok("on: disclosure promises renewal reminder + 30-day price notice", /reminder before each renewal/i.test(disc) && /30 days/i.test(disc));
  ok("on: Terms link points at the published Terms page", (await page.locator("#terms-link").evaluate(e => e.href)) === BASE + "terms/");
  ok("on: prices shown", /\$15/.test(await page.locator("#plans").innerText()) && /\$144/.test(await page.locator("#plans").innerText()) && /\$199/.test(await page.locator("#plans").innerText()));
  await page.fill("#email", "teacher-e2e@example.invalid");
  await page.click("#buy");
  ok("on: Buy needs the Terms box", /accept the Terms/i.test(await page.locator("#msg").innerText()));
  await page.check("#agree");
  await Promise.all([page.waitForURL(/session_id=|teacher\/$/), page.click("#buy")]);
  ok("checkout: success/cancel go to the gradealong teacher page", checkoutBody.get("success_url").startsWith(BASE + "teacher/?session_id=") && checkoutBody.get("cancel_url").startsWith(BASE + "teacher/?canceled=1"));
  ok("checkout: tax + cards only", checkoutBody.get("automatic_tax[enabled]") === "true" && checkoutBody.get("payment_method_types[]") === "card");
  await page.waitForSelector("#signedin", { state: "visible" });
  ok("checkout: account records the published Terms version", db.prepare("SELECT terms_version FROM individual_accounts WHERE email='teacher-e2e@example.invalid'").get()?.terms_version === "teacher-terms-2026-11-23");
  ok("after pay: signed in, code shown once, 30 papers", await page.locator("#codebox").isVisible() && /30/.test(await page.locator("#me").innerText()));
  const code = await page.locator("#code").innerText();
  ok("code format", /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/.test(code));
  ok("URL cleaned (no session id left)", !page.url().includes("session_id"));
  // 3. open the main app with the plan session
  await page.click("#open");
  await page.waitForSelector("#mode-teacher", { state: "visible", timeout: 15000 });
  ok("main app: unlocked with the plan badge", /Teacher plan/.test(await page.locator("#mode-badge").innerText()));
  await page.click("#mode-teacher");
  await page.waitForSelector("#school-bar", { state: "visible", timeout: 15000 });
  const bar = await page.locator("#school-bar").innerText();
  ok("main app: plan bar shows Teacher plan + 0 of 30 this period", /Teacher plan/.test(bar) && /0 of 30 papers used this period/.test(bar));
  ok("main app: no school admin panel", !(await page.locator("#school-admin").isVisible()));
  const g = await page.evaluate(async () => { const t = localStorage.getItem("storigen-grade-along-session"); const r = await fetch("https://grade-along-api.storigen.workers.dev/grade", { method: "POST", headers: { "Content-Type": "application/json", "X-Teacher-Session": t }, body: JSON.stringify({ firstName: "Testy", grade: "3", text: "A robot found a kite." }) }); return { s: r.status, d: await r.json() }; });
  ok("grading with the plan session uses one paper", g.s === 200 && g.d.usage && g.d.usage.used === 1 && g.d.usage.cap === 30);
  // 4. sign in again with the code on a new context
  const ctx2 = await browser.newContext({ serviceWorkers: "block" });
  await ctx2.route("https://grade-along-api.storigen.workers.dev/**", async (route) => { const r = route.request(); const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, X-Teacher-Passcode, X-Teacher-Session", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" }; if (r.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors }); const req = new Request(r.url(), { method: r.method(), headers: { ...r.headers(), origin: "https://gradealong.com", "cf-connecting-ip": "10.6.6." + (++ip % 250) }, body: ["GET", "HEAD"].includes(r.method()) ? undefined : r.postData() }); const res = await worker.fetch(req, useEnv); return route.fulfill({ status: res.status, headers: { "Content-Type": "application/json", ...cors }, body: await res.text() }); });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + "teacher/"); await p2.waitForSelector("#signin");
  await p2.fill("#semail", "teacher-e2e@example.invalid"); await p2.fill("#scode", code); await p2.click("#signin");
  await p2.waitForSelector("#signedin", { state: "visible" });
  ok("second device: sign in with email + code shows 29 left", /29/.test(await p2.locator("#me").innerText()));
  ok("no page errors", errors.length === 0);
  await browser.close();
  console.log(`\n${n} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
