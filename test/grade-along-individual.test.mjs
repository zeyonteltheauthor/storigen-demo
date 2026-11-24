// Staging: individual teacher accounts + Stripe (mocked) + reserve-before-AI. Fictional data only.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
if (!crypto.subtle.timingSafeEqual) crypto.subtle.timingSafeEqual = (a, b) => { const x = new Uint8Array(a), y = new Uint8Array(b); if (x.length !== y.length) return false; let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i]; return d === 0; };
const mod = await import(new URL("../worker/src/app.js", import.meta.url).href);
const ind = await import(new URL("../worker/src/individual.js", import.meta.url).href);
const worker = mod.default;
let pass = 0;
const ok = (name, cond) => { assert.ok(cond, name); pass++; console.log("PASS", name); };

function makeD1(db) {
  const wrap = (sql, params = []) => ({
    bind: (...p) => wrap(sql, p),
    async first() { const st = db.prepare(sql); if (/returning/i.test(sql)) return st.all(...params)[0] ?? null; return st.get(...params) ?? null; },
    async all() { return { results: db.prepare(sql).all(...params), success: true }; },
    async run() { const st = db.prepare(sql); if (/^\s*(select|pragma)/i.test(sql) || /returning/i.test(sql)) return { results: st.all(...params), meta: { changes: 0 } }; const r = st.run(...params); return { meta: { changes: Number(r.changes) } }; }
  });
  return { prepare: (sql) => wrap(sql), async exec(sql) { db.exec(sql); return {}; }, async batch(s) { const o = []; for (const x of s) o.push(await x.run()); return o; } };
}
const db = new DatabaseSync(":memory:");
db.exec(readFileSync(new URL("./fixtures/schema-v22.sql", import.meta.url), "utf8"));
const WH = "whsec_unit_test_only";
const env = {
  DB: makeD1(db), SESSION_SECRET: "s".repeat(32), ANTHROPIC_API_KEY: "test-not-a-key", APP_ENV: "staging",
  STRIPE_MODE: "test", STRIPE_SECRET_KEY: "rk_test_unit", STRIPE_WEBHOOK_SECRET: WH,
  STRIPE_PRICE_MONTHLY: "price_m", STRIPE_PRICE_YEARLY: "price_y", STRIPE_PRICE_YEARLY_PLUS: "price_yp",
  PLAN_PAPERS_MONTHLY: "30", PLAN_PAPERS_YEARLY: "360", PLAN_PAPERS_YEARLY_PLUS: "480", SCHOOL_FIX_PROTOTYPE: "on"
};
const now = Math.floor(Date.now() / 1000);
const stripe = { calls: [], subs: {}, sessions: {}, invoices: {}, charges: {}, live: false };
let aiMode = "ok", aiCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.startsWith("https://api.anthropic.com")) {
    aiCalls++;
    if (aiMode === "500") return new Response("{}", { status: 500 });
    const out = { lenses: { score: 3, comment: "Vivid." }, organization: { score: 3, comment: "Clear." }, development: { score: 3, comment: "Good." }, conventions: { score: 3, comment: "Ok." }, overallFeedback: "Nice work, Testy.", transcriptionNote: "" };
    return new Response(JSON.stringify({ model: "m", content: [{ type: "text", text: JSON.stringify(out) }], usage: { input_tokens: 100, output_tokens: 50 } }), { status: 200 });
  }
  if (url.startsWith("https://api.stripe.com")) {
    stripe.calls.push(init.method + " " + url.replace("https://api.stripe.com", "").split("?")[0]);
    assert.ok(String(init.headers.Authorization).startsWith("Bearer rk_test_"), "only test keys reach Stripe");
    const u = new URL(url); const p = u.pathname; const body = new URLSearchParams(init.body || "");
    const reply = (o) => new Response(JSON.stringify({ livemode: stripe.live, ...o }), { status: 200 });
    if (p === "/v1/customers" && init.method === "POST") return reply({ id: "cus_" + body.get("metadata[account_id]").slice(0, 8), object: "customer" });
    if (p === "/v1/checkout/sessions" && init.method === "POST") {
      stripe.lastCheckout = body;
      const id = "cs_test_" + (Object.keys(stripe.sessions).length + 1);
      stripe.sessions[id] = { id, object: "checkout.session", mode: "subscription", customer: body.get("customer"), client_reference_id: body.get("client_reference_id"), price: body.get("line_items[0][price]"), status: "open", payment_status: "unpaid" };
      return reply({ id, url: "https://checkout.stripe.com/c/pay/" + id });
    }
    let m;
    if ((m = p.match(/^\/v1\/checkout\/sessions\/(.+)$/))) return reply(stripe.sessions[m[1]]);
    if ((m = p.match(/^\/v1\/subscriptions\/(.+)$/))) return reply(stripe.subs[m[1]]);
    if ((m = p.match(/^\/v1\/invoices\/(.+)$/))) return reply(stripe.invoices[m[1]]);
    if ((m = p.match(/^\/v1\/charges\/(.+)$/))) return reply(stripe.charges[m[1]]);
    if (p === "/v1/billing_portal/sessions") return reply({ url: "https://billing.stripe.com/p/session/test_x" });
    return new Response(JSON.stringify({ error: { type: "invalid_request_error", code: "unmocked" } }), { status: 404 });
  }
  return realFetch(url, init);
};
let ip = 0;
async function call(path, body, headers = {}, method = "POST") {
  const res = await worker.fetch(new Request("https://grade-along-api-staging.storigen.workers.dev" + path, { method, headers: { Origin: "https://gradealong.com", "Content-Type": "application/json", "CF-Connecting-IP": "10.1." + (++ip % 250) + ".1", ...headers }, body: body ? JSON.stringify(body) : undefined }), env);
  let data; const txt = await res.text(); try { data = JSON.parse(txt); } catch { data = txt; }
  return { status: res.status, data };
}
async function sign(payload, secret = WH, t = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`))).toString("hex");
  return `t=${t},v1=${sig}`;
}
let evtN = 0;
async function webhook(type, object, opts = {}) {
  const evt = { id: opts.id || "evt_" + (++evtN), object: "event", type, livemode: !!opts.live, data: { object } };
  const raw = JSON.stringify(evt);
  const res = await worker.fetch(new Request("https://grade-along-api-staging.storigen.workers.dev/stripe/webhook", { method: "POST", headers: { "Stripe-Signature": opts.sig || await sign(raw, opts.secret) }, body: raw }), env);
  return { status: res.status, data: await res.json(), id: evt.id };
}
const q1 = (sql, ...p) => db.prepare(sql).get(...p);

// --- signature verification
const raw = '{"id":"evt_x"}';
ok("valid signature accepted", await ind.verifyStripeSignature(WH, await sign(raw), raw));
ok("wrong secret rejected", !(await ind.verifyStripeSignature(WH, await sign(raw, "whsec_other"), raw)));
ok("tampered body rejected", !(await ind.verifyStripeSignature(WH, await sign(raw), raw + " ")));
ok("old timestamp rejected", !(await ind.verifyStripeSignature(WH, await sign(raw, WH, now - 3600), raw)));
ok("missing header rejected", !(await ind.verifyStripeSignature(WH, "", raw)));
const bad = await webhook("invoice.paid", {}, { sig: "t=1,v1=00" });
ok("webhook with bad signature -> 400", bad.status === 400);

// --- key guard
ok("guard: rk_test_ allowed", ind.stripeGuard(env) === null);
for (const k of ["sk_live_x", "rk_live_x", "sk_test_x", "pk_test_x", ""]) ok("guard blocks " + (k || "empty"), ind.stripeGuard({ ...env, STRIPE_SECRET_KEY: k }) !== null);
{
  const before = stripe.calls.length;
  const saved = env.STRIPE_SECRET_KEY; env.STRIPE_SECRET_KEY = "sk_live_should_never_be_used";
  const r = await call("/individual/checkout", { email: "live@example.invalid", plan: "monthly", agree: true });
  env.STRIPE_SECRET_KEY = saved;
  ok("checkout refuses a live key with 503 and makes no Stripe call", r.status === 503 && stripe.calls.length === before);
}

// --- plans + page
const plansRes = await call("/individual/plans", null, {}, "GET");
ok("plans listed (3)", plansRes.status === 200 && plansRes.data.plans.length === 3 && plansRes.data.plans[0].papers === 30);
const page = await worker.fetch(new Request("https://grade-along-api-staging.storigen.workers.dev/teacher"), env);
ok("staging test page served", page.status === 200 && (await page.text()).includes("STAGING TEST"));
const pageProd = await worker.fetch(new Request("https://x/teacher"), { ...env, APP_ENV: "production" });
ok("test page hidden outside staging", pageProd.status === 404);

// --- checkout validation
ok("checkout needs agree", (await call("/individual/checkout", { email: "t1@example.invalid", plan: "monthly" })).status === 400);
ok("checkout needs plan", (await call("/individual/checkout", { email: "t1@example.invalid", plan: "nope", agree: true })).status === 400);
const co = await call("/individual/checkout", { email: "T1@Example.invalid", plan: "monthly", agree: true });
ok("checkout returns a Stripe URL", co.status === 200 && co.data.url.includes("checkout.stripe.com"));
ok("checkout: Stripe Tax on (automatic_tax, billing address required, saved to customer)", stripe.lastCheckout.get("automatic_tax[enabled]") === "true" && stripe.lastCheckout.get("billing_address_collection") === "required" && stripe.lastCheckout.get("customer_update[address]") === "auto");
ok("checkout: cards only, Link hidden", stripe.lastCheckout.get("payment_method_types[]") === "card" && stripe.lastCheckout.get("wallet_options[link][display]") === "never");
const acct = q1("SELECT * FROM individual_accounts WHERE email = 't1@example.invalid'");
ok("pending account created with Stripe customer", acct && acct.status === "pending" && acct.stripe_customer_id);
const sessId = Object.keys(stripe.sessions)[0];

// --- confirm before payment
ok("confirm before payment -> 409", (await call("/individual/confirm", { sessionId: sessId })).status === 409);
// simulate payment
const subId = "sub_1";
stripe.subs[subId] = { id: subId, object: "subscription", customer: acct.stripe_customer_id, status: "active", cancel_at_period_end: false, metadata: { account_id: acct.id }, items: { data: [{ price: { id: "price_m" }, current_period_start: now - 60, current_period_end: now + 30 * 86400 }] } };
stripe.invoices.in_1 = { id: "in_1", object: "invoice", status: "paid", billing_reason: "subscription_create", customer: acct.stripe_customer_id, amount_paid: 1500, parent: { subscription_details: { subscription: subId } }, lines: { data: [{ amount: 1500, pricing: { price_details: { price: "price_m" } }, period: { start: now - 60, end: now + 30 * 86400 } }] } };
Object.assign(stripe.sessions[sessId], { status: "complete", payment_status: "paid", subscription: subId, invoice: "in_1" });

// webhook first (as Stripe usually does), then confirm
const w1 = await webhook("invoice.paid", stripe.invoices.in_1);
ok("invoice.paid webhook -> 200", w1.status === 200);
const per = () => q1("SELECT COALESCE(SUM(papers_allowed),0) a, COALESCE(SUM(papers_used),0) u FROM individual_periods WHERE account_id = ? AND voided = 0", acct.id);
ok("30 papers granted", per().a === 30);
const w1dup = await webhook("invoice.paid", stripe.invoices.in_1, { id: w1.id });
ok("same event delivered twice -> duplicate, no extra papers", w1dup.data.duplicate === true && per().a === 30);
await webhook("invoice.paid", stripe.invoices.in_1);
ok("same invoice in a new event -> still 30 papers", per().a === 30);
const live = await webhook("invoice.paid", { ...stripe.invoices.in_1, id: "in_live" }, { live: true });
ok("livemode event refused on staging", live.status === 400 && per().a === 30);

const cf = await call("/individual/confirm", { sessionId: sessId });
ok("confirm returns token + sign-in code", cf.status === 200 && cf.data.token.startsWith("ind_") && /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/.test(cf.data.signinCode));
ok("confirm did not double-grant", per().a === 30 && cf.data.account.usage.papersLeft === 30);
const cf2 = await call("/individual/confirm", { sessionId: sessId });
ok("second confirm gives no token", cf2.status === 200 && cf2.data.alreadyConfirmed && !cf2.data.token);
const T = { "X-Teacher-Session": cf.data.token };
const me = await call("/individual/me", null, T, "GET");
ok("me shows plan + 30 left", me.status === 200 && me.data.account.usage.papersLeft === 30 && me.data.account.status === "active");
{ const v = (await call("/verify", {}, T)).data; ok("verify reports individual mode", v.mode === "individual" && v.usage && v.usage.cap === 30 && v.usage.remaining === 30 && v.school.name === "Teacher plan" && v.user.role === "teacher"); }
ok("individual token can't use school routes", (await call("/school", null, T, "GET")).status === 401);
ok("individual token can't use owner routes", (await call("/owner/schools", null, T, "GET")).status === 403);

// --- grading: reserve before AI, charge on success, release on failure
aiCalls = 0;
const g1 = await call("/grade", { firstName: "Testy", grade: "3", text: "A robot found a kite." }, T);
ok("grade ok, 1 paper used", g1.status === 200 && g1.data.usageId && per().u === 1 && g1.data.individualUsage.papersLeft === 29);
const g1b = await call("/grade", { firstName: "Testy", grade: "3", text: "A robot found a kite." }, T);
ok("same paper within 24h is free", g1b.status === 200 && g1b.data.free && per().u === 1);
const g1c = await call("/grade", { firstName: "Testy", grade: "3", text: "A robot found a kite. The end." }, T);
ok("different paper is charged", g1c.status === 200 && per().u === 2);
aiMode = "500";
const g2 = await call("/grade", { firstName: "Testy", grade: "3", text: "A different story about rain." }, T);
ok("AI failure -> 502 and the paper is given back", g2.status === 502 && per().u === 2);
ok("released usage recorded", q1("SELECT COUNT(*) n FROM individual_usage WHERE state='released'").n === 1);
aiMode = "ok";
const cost = q1("SELECT * FROM ai_cost_daily WHERE scope='individual'");
ok("AI token tally recorded (no student content)", cost && cost.calls >= 2 && cost.input_tokens >= 200);

// --- flag a bad result (cap = min(3, 10% of 30) = 3)
const flag1 = await call("/individual/usage/flag", { usageId: g1.data.usageId, reason: "garbled_text" }, T);
ok("flag restores a paper", flag1.status === 200 && flag1.data.restored && per().u === 1 && flag1.data.cap === 3);
ok("flag twice -> rejected", (await call("/individual/usage/flag", { usageId: g1.data.usageId, reason: "other" }, T)).status === 404);

// --- last-paper race: only one reservation wins, loser never calls the AI
db.prepare("UPDATE individual_periods SET papers_used = papers_allowed - 1 WHERE account_id = ?").run(acct.id);
aiCalls = 0;
const [r1, r2] = await Promise.all([
  call("/grade", { firstName: "Testy", grade: "3", text: "Race paper one." }, T),
  call("/grade", { firstName: "Testy", grade: "3", text: "Race paper two." }, T)
]);
const statuses = [r1.status, r2.status].sort();
ok("race at the last paper: one 200, one 403", statuses[0] === 200 && statuses[1] === 403);
ok("loser made no AI call", aiCalls === 1);
ok("no unpaid draft: used == allowed", per().u === per().a);
const g3 = await call("/grade", { firstName: "Testy", grade: "3", text: "One more." }, T);
ok("out of papers -> 403 before AI", g3.status === 403 && aiCalls === 1);

// --- upgrade monthly->... same interval top-up (yearly -> yearly plus) and renewal
db.prepare("UPDATE individual_periods SET papers_used = 0").run();
stripe.subs[subId].items.data[0].price.id = "price_y";
stripe.invoices.in_2 = { ...stripe.invoices.in_1, id: "in_2", billing_reason: "subscription_update", amount_paid: 12900, lines: { data: [{ amount: -1400, pricing: { price_details: { price: "price_m" } }, period: { start: now, end: now + 29 * 86400 } }, { amount: 14300, pricing: { price_details: { price: "price_y" } }, period: { start: now, end: now + 365 * 86400 } }] } };
stripe.subs[subId].items.data[0].current_period_start = now; stripe.subs[subId].items.data[0].current_period_end = now + 365 * 86400;
await webhook("invoice.paid", stripe.invoices.in_2);
ok("monthly -> yearly (interval change): old period voided, 360 granted", per().a === 360);
stripe.subs[subId].items.data[0].price.id = "price_yp";
stripe.invoices.in_3 = { ...stripe.invoices.in_2, id: "in_3", amount_paid: 5000, lines: { data: [{ amount: 5000, pricing: { price_details: { price: "price_yp" } }, period: { start: now, end: now + 365 * 86400 } }] } };
await webhook("invoice.paid", stripe.invoices.in_3);
ok("yearly -> yearly plus (same interval): +120 top-up = 480", per().a === 480);

// --- device limit (2)
const code = cf.data.signinCode;
const s1 = await call("/individual/signin", { email: "t1@example.invalid", code });
const s2 = await call("/individual/signin", { email: "t1@example.invalid", code });
ok("sign-in with code works", s1.status === 200 && s2.status === 200);
ok("device limit keeps 2 sessions", q1("SELECT COUNT(*) n FROM individual_sessions WHERE account_id=?", acct.id).n === 2);
ok("oldest session signed out", (await call("/individual/me", null, T, "GET")).status === 401);
const T2 = { "X-Teacher-Session": s2.data.token };
ok("wrong code -> 401", (await call("/individual/signin", { email: "t1@example.invalid", code: "AAAA-AAAA-AAAA-AAAA" })).status === 401);
const portal = await call("/individual/portal", {}, T2);
ok("portal session URL", portal.status === 200 && portal.data.url.includes("billing.stripe.com"));

// --- payment failed, refund, dispute, cancel
await webhook("invoice.payment_failed", { id: "in_f", object: "invoice", customer: acct.stripe_customer_id });
ok("payment failed -> past_due", q1("SELECT status FROM individual_accounts WHERE id=?", acct.id).status === "past_due");
await webhook("charge.refunded", { id: "ch_3", object: "charge", customer: acct.stripe_customer_id, amount: 5000, amount_refunded: 2000, refunded: false });
ok("partial refund: papers unchanged", per().a === 480);
await webhook("charge.refunded", { id: "ch_3", object: "charge", customer: acct.stripe_customer_id, amount: 5000, amount_refunded: 5000, refunded: true });
ok("full refund of the top-up voids that period", per().a === 360);
stripe.charges.ch_2 = { id: "ch_2", object: "charge", customer: acct.stripe_customer_id, amount: 12900 };
await webhook("charge.dispute.created", { id: "dp_1", object: "dispute", charge: "ch_2", status: "needs_response" });
ok("dispute pauses the account and signs out", q1("SELECT status FROM individual_accounts WHERE id=?", acct.id).status === "paused" && q1("SELECT COUNT(*) n FROM individual_sessions WHERE account_id=?", acct.id).n === 0);
const sP = await call("/individual/signin", { email: "t1@example.invalid", code });
const gP = await call("/grade", { firstName: "Testy", grade: "3", text: "Paused try." }, { "X-Teacher-Session": sP.data.token });
ok("paused account can't grade", gP.status === 403);
await webhook("charge.dispute.closed", { id: "dp_1", object: "dispute", charge: "ch_2", status: "won" });
ok("dispute won -> unpaused", q1("SELECT status FROM individual_accounts WHERE id=?", acct.id).status !== "paused");
stripe.subs[subId] = { ...stripe.subs[subId], status: "canceled", ended_at: now };
await webhook("customer.subscription.deleted", stripe.subs[subId]);
const cancelled = q1("SELECT status, delete_after FROM individual_accounts WHERE id=?", acct.id);
ok("cancel -> canceled with delete date ~30 days out", cancelled.status === "canceled" && Date.parse(cancelled.delete_after) > Date.now() + 29 * 86400e3);
ok("new checkout for the same email allowed after cancel", (await call("/individual/checkout", { email: "t1@example.invalid", plan: "yearly", agree: true })).status === 200);

// --- retention
db.prepare("UPDATE individual_accounts SET delete_after = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), acct.id);
const ret = await ind.runIndividualRetention(env);
ok("retention deletes the account and its rows", ret.deleted === 1 && !q1("SELECT id FROM individual_accounts WHERE id=?", acct.id) && q1("SELECT COUNT(*) n FROM individual_periods WHERE account_id=?", acct.id).n === 0);

// --- school prototype: the last-paper draft is not handed out
const PASS = "p-" + Math.random().toString(36).slice(2); env.TEACHER_PASSCODE = PASS;
const mk = await call("/owner/schools", { name: "ZZ staging proto", paperAllowance: 1, adminName: "Admin", adminEmail: "a@example.invalid" }, { "X-Teacher-Passcode": PASS });
const red = await call("/auth/redeem", { email: "a@example.invalid", code: mk.data.inviteCode });
const S = { "X-Teacher-Session": red.data.token };
const [sa, sb] = await Promise.all([call("/grade", { firstName: "Testy", grade: "3", text: "School race A." }, S), call("/grade", { firstName: "Testy", grade: "3", text: "School race B." }, S)]);
const ss = [sa.status, sb.status].sort();
ok("school prototype: race gives one draft, one refusal (no unpaid draft)", ss[0] === 200 && ss[1] === 403);

// --- production inertness + live-mode guards
{
  const before = stripe.calls.length;
  const prodEnv = { DB: env.DB, SESSION_SECRET: env.SESSION_SECRET, ANTHROPIC_API_KEY: "x", TEACHER_PASSCODE: "p-prod-test" }; // production today: no Stripe vars
  const req = (path, method = "GET", body) => worker.fetch(new Request("https://grade-along-api.storigen.workers.dev" + path, { method, headers: { Origin: "https://gradealong.com", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }), prodEnv);
  const pl = await req("/individual/plans"); const pj = await pl.json();
  ok("inert: plans says not available", pl.status === 200 && pj.available === false && pj.plans.length === 0);
  const ck = await req("/individual/checkout", "POST", { email: "x@example.invalid", plan: "monthly", agree: true });
  ok("inert: checkout 503 not available yet", ck.status === 503 && (await ck.json()).error.includes("not available yet"));
  const wh = await worker.fetch(new Request("https://grade-along-api.storigen.workers.dev/stripe/webhook", { method: "POST", body: "{}" }), prodEnv);
  ok("inert: webhook 503", wh.status === 503);
  const tp = await worker.fetch(new Request("https://grade-along-api.storigen.workers.dev/teacher"), prodEnv);
  ok("inert: staging test page hidden in production", tp.status === 404);
  ok("inert: individual token rejected", (await worker.fetch(new Request("https://grade-along-api.storigen.workers.dev/verify", { method: "POST", headers: { "X-Teacher-Session": "ind_" + "a".repeat(64) } }), prodEnv)).status === 401);
  ok("inert: no Stripe calls", stripe.calls.length === before);
  const pin = await worker.fetch(new Request("https://grade-along-api.storigen.workers.dev/verify", { method: "POST", headers: { "X-Teacher-Passcode": "p-prod-test" } }), prodEnv);
  ok("inert: passcode verify still works", pin.status === 200 && (await pin.json()).mode === "passcode");
  // fresh DB: inert retention never creates tables
  const db2 = new DatabaseSync(":memory:"); db2.exec(readFileSync(new URL("./fixtures/schema-v22.sql", import.meta.url), "utf8"));
  const r2 = await ind.runIndividualRetention({ DB: makeD1(db2), SESSION_SECRET: "x" });
  ok("inert: retention skips and creates no tables", r2.skipped && !db2.prepare("SELECT name FROM sqlite_master WHERE name='individual_accounts'").get());
  // live-mode guards
  ok("live: rk_live_ refused without STRIPE_MODE=live", ind.stripeGuard({ STRIPE_SECRET_KEY: "rk_live_x" }) !== null);
  ok("live: rk_live_ allowed with STRIPE_MODE=live", ind.stripeGuard({ STRIPE_SECRET_KEY: "rk_live_x", STRIPE_MODE: "live" }) === null);
  ok("live: sk_live_ refused even in live mode", ind.stripeGuard({ STRIPE_SECRET_KEY: "sk_live_x", STRIPE_MODE: "live" }) !== null);
  ok("live: rk_test_ refused in live mode", ind.stripeGuard({ STRIPE_SECRET_KEY: "rk_test_x", STRIPE_MODE: "live" }) !== null);
  ok("live: never on staging", ind.stripeGuard({ STRIPE_SECRET_KEY: "rk_live_x", STRIPE_MODE: "live", APP_ENV: "staging" }) !== null);
  const liveFull = { DB: env.DB, SESSION_SECRET: "s", STRIPE_SECRET_KEY: "rk_live_x", STRIPE_MODE: "live", STRIPE_WEBHOOK_SECRET: "w", STRIPE_PRICE_MONTHLY: "a", STRIPE_PRICE_YEARLY: "b", STRIPE_PRICE_YEARLY_PLUS: "c" };
  ok("live: billing stays off until BILLING_ENABLED=on", !ind.billingEnabled(liveFull) && ind.billingEnabled({ ...liveFull, BILLING_ENABLED: "on" }));
  ok("test mode: billing on without the switch (staging)", ind.billingEnabled(env));
}
console.log(`\n${pass} passed`);
