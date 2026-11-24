// Grade Along — individual teacher accounts, Stripe subscriptions, paper allowance.
// STAGING BUILD (Phases 2–4 of the Teacher Subscriptions & Payments Build Plan, Nov 23, 2026).
// Runs only on grade-along-api-staging against the Stripe sandbox. Not deployed to production.
//
// Money rules:
//  * Papers come only from a PAID Stripe invoice (webhook, or a server-side lookup after Checkout).
//    The browser never grants papers. One grant per invoice id (UNIQUE), so retries can't double-grant.
//  * A paper is RESERVED in one atomic UPDATE before the AI is called, and RELEASED when the AI fails
//    or the result isn't usable. No reservation, no AI call.
//  * In test mode the Worker refuses any key that isn't rk_test_ and any livemode event or object.
// Nothing here stores student work: only account email, Stripe ids, dates, paper counts and token counts.

// ---------------------------------------------------------------------------------------------
// PROVISIONAL defaults (Don's open decisions #4–#7, #9). Change here; documented in the plan doc.
export const PROVISIONAL = {
  DEVICE_LIMIT: 2,                 // decision 5: signed-in devices per teacher; a 3rd sign-in signs out the oldest
  FLAG_CAP_MAX: 3,                 // decision 5: Flag bad result restores per calendar month (UTC) ...
  FLAG_CAP_PCT: 0.10,              // ... or 10% of the current allowance, whichever is lower (min 1)
  FLAG_WINDOW_MS: 24 * 3600e3,     // only charges from the last 24 hours can be flagged
  FREE_AI_DAILY_CAP: 40,           // cover reads / page splits / rubric reads per teacher per UTC day (no paper used)
  RETENTION_DAYS: 30,              // decision 7: data kept this long after a subscription ends, then deleted
  HISTORY: "device",               // decision 6: saved scores stay on the device for individuals (no server table)
  CARDS: "card, USD",              // decision 9: cards only, USD. Blocking non-US cards needs a Stripe Radar rule (not set)
  REFUND_RULE: "full refund voids the paid period; partial refunds are recorded only", // decision 4
  SESSION_DAYS: 30,
  RESERVE_STALE_MS: 15 * 60e3,     // reservations left open this long (crashed request) are released
  SIGNIN_MAX_FAILS: 5,
  SIGNIN_LOCK_MS: 15 * 60e3
};

// Labels for the staging test page only. Amounts mirror the sandbox prices (LOCKED by Don, Nov 23, 2026; tax added on top).
const PLAN_INFO = {
  monthly: { label: "Monthly", interval: "month", amount: 1500 },
  yearly: { label: "Yearly", interval: "year", amount: 14400 },
  yearly_plus: { label: "Yearly Plus", interval: "year", amount: 19900 }
};

export function plans(env) {
  const p = (key, priceVar, papersVar) => ({
    key, priceId: String(env[priceVar] || ""), papers: Number(env[papersVar]) || 0,
    interval: PLAN_INFO[key].interval, label: PLAN_INFO[key].label, amount: PLAN_INFO[key].amount
  });
  return [
    p("monthly", "STRIPE_PRICE_MONTHLY", "PLAN_PAPERS_MONTHLY"),
    p("yearly", "STRIPE_PRICE_YEARLY", "PLAN_PAPERS_YEARLY"),
    p("yearly_plus", "STRIPE_PRICE_YEARLY_PLUS", "PLAN_PAPERS_YEARLY_PLUS")
  ].filter((x) => x.priceId && x.papers > 0);
}
const planByKey = (env, k) => plans(env).find((p) => p.key === k) || null;
const planByPrice = (env, id) => plans(env).find((p) => p.priceId === id) || null;

// ---------------------------------------------------------------------------------------------
// Small helpers
const nowIso = () => new Date().toISOString();
const isoFromUnix = (s) => (Number(s) > 0 ? new Date(Number(s) * 1000).toISOString() : null);
const dbOne = (env, sql, ...p) => env.DB.prepare(sql).bind(...p).first();
const dbAll = async (env, sql, ...p) => ((await env.DB.prepare(sql).bind(...p).all()).results || []);
const dbRun = (env, sql, ...p) => env.DB.prepare(sql).bind(...p).run();
const changes = (r) => Number((r && r.meta && r.meta.changes) || 0);

function randomHex(n) {
  const b = new Uint8Array(n); crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
async function hmacHex(secret, value) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return Array.from(new Uint8Array(sig), (x) => x.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, "0")).join("");
}
function timingSafeEqualStr(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function cleanEmail(v) {
  const s = (typeof v === "string" ? v : "").trim().toLowerCase().slice(0, 200);
  return /^[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : "";
}
function recoveryCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  const chars = Array.from(b, (x) => alphabet[x % alphabet.length]).join("");
  return chars.match(/.{4}/g).join("-");
}
const normCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const monthStartIso = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString(); };
const dayStamp = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------------------------
// Schema (additive; applied on first use)
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS individual_accounts (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, status TEXT NOT NULL,
    stripe_customer_id TEXT UNIQUE, plan_key TEXT, recovery_hash TEXT,
    confirm_session_id TEXT, confirm_used_at TEXT, terms_version TEXT, terms_accepted_at TEXT,
    paused_reason TEXT, signin_fails INTEGER NOT NULL DEFAULT 0, signin_locked_until TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, closed_at TEXT, delete_after TEXT)`,
  `CREATE TABLE IF NOT EXISTS individual_subscriptions (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, plan_key TEXT, price_id TEXT, status TEXT NOT NULL,
    current_period_start TEXT, current_period_end TEXT, cancel_at_period_end INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS individual_subscriptions_acct ON individual_subscriptions(account_id)`,
  `CREATE TABLE IF NOT EXISTS individual_periods (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, stripe_invoice_id TEXT UNIQUE, kind TEXT NOT NULL, plan_key TEXT,
    period_start TEXT NOT NULL, period_end TEXT NOT NULL, papers_allowed INTEGER NOT NULL, papers_used INTEGER NOT NULL DEFAULT 0,
    amount_paid INTEGER, voided INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS individual_periods_acct ON individual_periods(account_id, period_end)`,
  `CREATE TABLE IF NOT EXISTS individual_usage (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, period_id TEXT NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL,
    paper_key TEXT, input_tokens INTEGER, output_tokens INTEGER, created_at TEXT NOT NULL, settled_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS individual_usage_acct ON individual_usage(account_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS individual_usage_key ON individual_usage(account_id, paper_key)`,
  `CREATE TABLE IF NOT EXISTS individual_sessions (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL, created_at TEXT NOT NULL, last_used_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS individual_sessions_acct ON individual_sessions(account_id)`,
  `CREATE TABLE IF NOT EXISTS individual_credit_flags (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, usage_id TEXT NOT NULL UNIQUE, reason TEXT NOT NULL,
    restored INTEGER NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS individual_daily_free (
    account_id TEXT NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (account_id, day, kind))`,
  `CREATE TABLE IF NOT EXISTS stripe_events (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, livemode INTEGER NOT NULL, received_at TEXT NOT NULL,
    processed_at TEXT, result TEXT)`,
  `CREATE TABLE IF NOT EXISTS ai_cost_daily (
    day TEXT NOT NULL, scope TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, scope))`
];
let schemaReady = false;
export async function ensureIndividualSchema(env) {
  if (schemaReady || !env.DB) return;
  for (const s of SCHEMA) await env.DB.prepare(s).run();
  schemaReady = true;
}
export const INDIVIDUAL_SCHEMA_SQL = SCHEMA.join(";\n") + ";";

// ---------------------------------------------------------------------------------------------
// Stripe (REST over fetch, no SDK). Test-mode guard on every call.
export function stripeGuard(env) {
  const k = String(env.STRIPE_SECRET_KEY || "");
  if (!k) return "Payments are not set up yet.";
  if (env.STRIPE_MODE === "live" && env.APP_ENV === "staging") return "Payments are paused: live mode is never allowed on staging.";
  if (env.STRIPE_MODE !== "live") {
    if (!k.startsWith("rk_test_")) return "Payments are paused: this server only accepts a Stripe test key.";
  } else if (!k.startsWith("rk_live_")) {
    return "Payments are paused: expected a restricted live key.";
  }
  return null;
}
// Billing is ON only when every piece is in place. Until then all teacher-plan routes say "not available yet"
// and nothing touches the database (production stays inert). Live mode also needs the explicit BILLING_ENABLED=on switch.
export function billingEnabled(env) {
  if (!env || !env.DB || !env.SESSION_SECRET) return false;
  if (stripeGuard(env)) return false;
  if (!env.STRIPE_WEBHOOK_SECRET) return false;
  if (!env.STRIPE_PRICE_MONTHLY || !env.STRIPE_PRICE_YEARLY || !env.STRIPE_PRICE_YEARLY_PLUS) return false;
  if (env.BILLING_ENABLED === "off") return false;
  if (env.STRIPE_MODE === "live" && env.BILLING_ENABLED !== "on") return false;
  return true;
}
// School-style usage shape so the existing web app's usage bar can show a teacher plan.
export function schoolShapeUsage(u) {
  const cap = (u && u.papersAllowed) || 0, used = (u && u.papersUsed) || 0, remaining = Math.max(0, cap - used);
  return { used, cap, remaining, warn: cap > 0 && used / cap >= 0.8 && remaining > 0, stopped: remaining <= 0, year: null, status: "active", periodEnd: (u && u.periodEnd) || null, individual: true };
}
function encodeForm(params, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(params)) {
    const name = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      v.forEach((x, i) => {
        if (x && typeof x === "object") encodeForm(x, `${name}[${i}]`, out);
        else out.append(`${name}[]`, String(x));
      });
    } else if (typeof v === "object") encodeForm(v, name, out);
    else out.append(name, String(v));
  }
  return out;
}
export { encodeForm };
export async function stripeCall(env, method, path, params, idem) {
  const blocked = stripeGuard(env);
  if (blocked) { const e = new Error(blocked); e.status = 503; e.guard = true; throw e; }
  const headers = { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` };
  if (env.STRIPE_API_VERSION) headers["Stripe-Version"] = env.STRIPE_API_VERSION;
  let url = `https://api.stripe.com${path}`;
  let body;
  if (params && method === "GET") url += "?" + encodeForm(params).toString();
  else if (params) { body = encodeForm(params).toString(); headers["Content-Type"] = "application/x-www-form-urlencoded"; }
  if (idem) headers["Idempotency-Key"] = idem;
  const r = await fetch(url, { method, headers, body });
  let data = null;
  try { data = await r.json(); } catch {}
  if (!r.ok) {
    const e = new Error("stripe " + r.status + " " + ((data && data.error && (data.error.code || data.error.type)) || ""));
    e.status = r.status; e.stripe = data && data.error ? { type: data.error.type, code: data.error.code, param: data.error.param, message: String(data.error.message || "").slice(0, 240) } : null;
    throw e;
  }
  if (data && data.livemode === true && env.STRIPE_MODE !== "live") {
    const e = new Error("live object refused on a test server"); e.status = 500; throw e;
  }
  if (data && data.livemode === false && env.STRIPE_MODE === "live") {
    const e = new Error("test object refused on a live server"); e.status = 500; throw e;
  }
  return data;
}

// Stripe-Signature: t=<unix>,v1=<hex>[,v1=...]. HMAC-SHA256 of `${t}.${rawBody}` with the endpoint secret.
export async function verifyStripeSignature(secret, header, rawBody, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)) {
  if (!secret || !header) return false;
  let t = null; const v1 = [];
  for (const part of String(header).split(",")) {
    const i = part.indexOf("="); if (i < 0) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === "t") t = Number(v); else if (k === "v1") v1.push(v);
  }
  if (!Number.isFinite(t) || !v1.length) return false;
  if (Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  return v1.some((s) => timingSafeEqualStr(s, expected));
}

// ---------------------------------------------------------------------------------------------
// Accounts, sessions
async function accountByEmail(env, email) { return dbOne(env, "SELECT * FROM individual_accounts WHERE email = ?", email); }
async function accountById(env, id) { return dbOne(env, "SELECT * FROM individual_accounts WHERE id = ?", id); }
async function accountByCustomer(env, cus) { return cus ? dbOne(env, "SELECT * FROM individual_accounts WHERE stripe_customer_id = ?", cus) : null; }

async function issueSession(env, accountId) {
  const token = "ind_" + randomHex(32);
  const hash = await hmacHex(env.SESSION_SECRET, "ind-session:" + token);
  const exp = new Date(Date.now() + PROVISIONAL.SESSION_DAYS * 86400e3).toISOString();
  await dbRun(env, "INSERT INTO individual_sessions (id, account_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    crypto.randomUUID(), accountId, hash, exp, nowIso());
  // Device limit (provisional): keep only the newest N sessions.
  await dbRun(env, `DELETE FROM individual_sessions WHERE account_id = ? AND id NOT IN
    (SELECT id FROM individual_sessions WHERE account_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)`,
    accountId, accountId, PROVISIONAL.DEVICE_LIMIT);
  return token;
}
export async function loadIndividualSession(env, token) {
  if (!env.DB || !env.SESSION_SECRET || !String(token).startsWith("ind_")) return null;
  if (!billingEnabled(env)) return null; // inert: never touch the DB
  await ensureIndividualSchema(env);
  const hash = await hmacHex(env.SESSION_SECRET, "ind-session:" + token);
  const row = await dbOne(env, `SELECT s.id AS session_id, s.expires_at, a.* FROM individual_sessions s
    JOIN individual_accounts a ON a.id = s.account_id WHERE s.token_hash = ?`, hash);
  if (!row || row.expires_at < nowIso() || row.status === "closed") return null;
  return { kind: "individual", account: row, sessionId: row.session_id };
}

async function currentPeriods(env, accountId) {
  const now = nowIso();
  return dbAll(env, `SELECT * FROM individual_periods WHERE account_id = ? AND voided = 0 AND period_start <= ? AND period_end > ?
    ORDER BY period_end ASC`, accountId, now, now);
}
export async function individualUsage(env, account) {
  const ps = await currentPeriods(env, account.id);
  const allowed = ps.reduce((n, p) => n + p.papers_allowed, 0);
  const used = ps.reduce((n, p) => n + p.papers_used, 0);
  const end = ps.length ? ps.reduce((m, p) => (p.period_end > m ? p.period_end : m), "") : null;
  return { papersAllowed: allowed, papersUsed: used, papersLeft: Math.max(0, allowed - used), periodEnd: end, plan: account.plan_key || null };
}
function canGrade(account) {
  if (!account) return "Sign in first.";
  if (account.status === "paused") return "This account is paused. Contact info@arrivalhousemedia.com.";
  if (account.status === "closed") return "This account is closed.";
  return null;
}

// ---------------------------------------------------------------------------------------------
// Paper reservation (used by /grade and /test/read for individual accounts)
export async function individualPaperKey(kind, firstName, parts) {
  return (await sha256Hex(kind + "|" + String(firstName || "").toLowerCase() + "|" + parts.join("|"))).slice(0, 40);
}
async function sweepStale(env, accountId) {
  const cutoff = new Date(Date.now() - PROVISIONAL.RESERVE_STALE_MS).toISOString();
  const stale = await dbAll(env, "SELECT id FROM individual_usage WHERE account_id = ? AND state = 'reserved' AND created_at < ?", accountId, cutoff);
  for (const s of stale) await releasePaper(env, s.id);
}
// Returns { ok, free } | { ok, usageId } | { ok:false, status, error, usage }
export async function reservePaper(env, auth, kind, paperKey) {
  await ensureIndividualSchema(env);
  const account = auth.account;
  const blocked = canGrade(account);
  if (blocked) return { ok: false, status: 403, error: blocked };
  await sweepStale(env, account.id);
  if (paperKey) {
    const since = new Date(Date.now() - 24 * 3600e3).toISOString();
    const prior = await dbOne(env, "SELECT id FROM individual_usage WHERE account_id = ? AND paper_key = ? AND state = 'charged' AND created_at > ? LIMIT 1",
      account.id, paperKey, since);
    if (prior) return { ok: true, free: true };
  }
  const now = nowIso();
  const row = await dbOne(env, `UPDATE individual_periods SET papers_used = papers_used + 1
    WHERE id = (SELECT id FROM individual_periods WHERE account_id = ? AND voided = 0 AND period_start <= ? AND period_end > ?
                AND papers_used < papers_allowed ORDER BY period_end ASC LIMIT 1)
      AND papers_used < papers_allowed
    RETURNING id`, account.id, now, now);
  if (!row) {
    const usage = await individualUsage(env, account);
    return { ok: false, status: 403, usage,
      error: usage.papersAllowed ? "You've used all your papers for this period." : "No paid papers on this account yet. Choose a plan or renew to keep grading." };
  }
  const usageId = crypto.randomUUID();
  await dbRun(env, "INSERT INTO individual_usage (id, account_id, period_id, kind, state, paper_key, created_at) VALUES (?, ?, ?, ?, 'reserved', ?, ?)",
    usageId, account.id, row.id, kind, paperKey || null, now);
  return { ok: true, usageId, periodId: row.id };
}
export async function chargePaper(env, usageId, tokens) {
  await dbRun(env, "UPDATE individual_usage SET state = 'charged', input_tokens = ?, output_tokens = ?, settled_at = ? WHERE id = ? AND state = 'reserved'",
    (tokens && tokens.input_tokens) || null, (tokens && tokens.output_tokens) || null, nowIso(), usageId);
}
export async function releasePaper(env, usageId) {
  const u = await dbOne(env, "UPDATE individual_usage SET state = 'released', settled_at = ? WHERE id = ? AND state = 'reserved' RETURNING period_id", nowIso(), usageId);
  if (u) await dbRun(env, "UPDATE individual_periods SET papers_used = CASE WHEN papers_used > 0 THEN papers_used - 1 ELSE 0 END WHERE id = ?", u.period_id);
  return !!u;
}
export async function recordAiCost(env, scope, tokens) {
  if (!env.DB || !tokens) return;
  try {
    await ensureIndividualSchema(env);
    await dbRun(env, `INSERT INTO ai_cost_daily (day, scope, calls, input_tokens, output_tokens) VALUES (?, ?, 1, ?, ?)
      ON CONFLICT(day, scope) DO UPDATE SET calls = calls + 1, input_tokens = input_tokens + excluded.input_tokens, output_tokens = output_tokens + excluded.output_tokens`,
      dayStamp(), scope, tokens.input_tokens || 0, tokens.output_tokens || 0);
  } catch {}
}
// Cover reads, page splits and rubric reads: no paper, but a daily cap for individuals.
export async function freeAiCall(env, auth, kind) {
  await ensureIndividualSchema(env);
  const blocked = canGrade(auth.account);
  if (blocked) return { ok: false, status: 403, error: blocked };
  const usage = await individualUsage(env, auth.account);
  if (!usage.papersAllowed) return { ok: false, status: 403, error: "No paid papers on this account yet." };
  const row = await dbOne(env, `INSERT INTO individual_daily_free (account_id, day, kind, count) VALUES (?, ?, ?, 1)
    ON CONFLICT(account_id, day, kind) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count`,
    auth.account.id, dayStamp(), kind, PROVISIONAL.FREE_AI_DAILY_CAP);
  if (!row) return { ok: false, status: 429, error: "Daily limit reached for this step. Try again tomorrow." };
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Fulfillment from Stripe objects (shared by webhook + checkout confirm). Idempotent.
function subPeriod(sub) {
  const it = sub && sub.items && sub.items.data && sub.items.data[0];
  return {
    start: sub.current_period_start || (it && it.current_period_start) || null,
    end: sub.current_period_end || (it && it.current_period_end) || null
  };
}
function subPriceId(sub) {
  const it = sub && sub.items && sub.items.data && sub.items.data[0];
  return (it && it.price && (it.price.id || it.price)) || (it && it.plan && it.plan.id) || null;
}
function invoiceSubscriptionId(inv) {
  if (!inv) return null;
  if (typeof inv.subscription === "string") return inv.subscription;
  if (inv.subscription && inv.subscription.id) return inv.subscription.id;
  const pd = inv.parent && inv.parent.subscription_details;
  if (pd && pd.subscription) return typeof pd.subscription === "string" ? pd.subscription : pd.subscription.id;
  for (const l of (inv.lines && inv.lines.data) || []) {
    if (typeof l.subscription === "string") return l.subscription;
    const p = l.parent && (l.parent.subscription_item_details || l.parent.invoice_item_details);
    if (p && p.subscription) return p.subscription;
  }
  return null;
}
function linePriceId(l) {
  return (l.price && (l.price.id || l.price)) || (l.pricing && l.pricing.price_details && l.pricing.price_details.price) || (l.plan && l.plan.id) || null;
}
const customerId = (x) => (typeof x === "string" ? x : x && x.id) || null;

function mapStatus(subStatus) {
  if (subStatus === "active" || subStatus === "trialing") return "active";
  if (subStatus === "past_due" || subStatus === "unpaid") return "past_due";
  if (subStatus === "canceled" || subStatus === "incomplete_expired") return "canceled";
  return null; // incomplete etc.: leave as is
}
async function findAccountFor(env, cus, metaAccountId) {
  let a = await accountByCustomer(env, cus);
  if (!a && metaAccountId) {
    a = await accountById(env, metaAccountId);
    if (a && !a.stripe_customer_id && cus) {
      await dbRun(env, "UPDATE individual_accounts SET stripe_customer_id = ?, updated_at = ? WHERE id = ?", cus, nowIso(), a.id);
      a.stripe_customer_id = cus;
    }
  }
  return a;
}
export async function upsertSubscription(env, sub) {
  const cus = customerId(sub.customer);
  const account = await findAccountFor(env, cus, sub.metadata && sub.metadata.account_id);
  if (!account) return "no account";
  const price = subPriceId(sub);
  const plan = planByPrice(env, price);
  const per = subPeriod(sub);
  await dbRun(env, `INSERT INTO individual_subscriptions (id, account_id, plan_key, price_id, status, current_period_start, current_period_end, cancel_at_period_end, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET plan_key = excluded.plan_key, price_id = excluded.price_id, status = excluded.status,
      current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end, updated_at = excluded.updated_at`,
    sub.id, account.id, plan ? plan.key : null, price, sub.status, isoFromUnix(per.start), isoFromUnix(per.end), sub.cancel_at_period_end ? 1 : 0, nowIso());
  const mapped = mapStatus(sub.status);
  if (mapped && account.status !== "paused" && account.status !== "closed") {
    let deleteAfter = null;
    if (mapped === "canceled") {
      const endMs = (Number(sub.ended_at || per.end) || Date.now() / 1000) * 1000;
      deleteAfter = new Date(Math.max(endMs, Date.now()) + PROVISIONAL.RETENTION_DAYS * 86400e3).toISOString();
    }
    await dbRun(env, "UPDATE individual_accounts SET status = ?, plan_key = COALESCE(?, plan_key), delete_after = ?, updated_at = ? WHERE id = ?",
      mapped, plan ? plan.key : null, deleteAfter, nowIso(), account.id);
  } else if (plan) {
    await dbRun(env, "UPDATE individual_accounts SET plan_key = ?, updated_at = ? WHERE id = ?", plan.key, nowIso(), account.id);
  }
  return "subscription " + sub.status;
}

// Grants papers for one PAID invoice. Keyed by invoice id, so calling twice grants once.
export async function grantFromInvoice(env, inv) {
  if (!inv || inv.object !== "invoice") return "not an invoice";
  if (inv.livemode && env.STRIPE_MODE !== "live") return "live invoice refused";
  if (inv.status !== "paid") return "invoice not paid";
  const already = await dbOne(env, "SELECT id FROM individual_periods WHERE stripe_invoice_id = ?", inv.id);
  if (already) return "already granted";
  const subId = invoiceSubscriptionId(inv);
  if (!subId) return "no subscription on invoice";
  const sub = await stripeCall(env, "GET", `/v1/subscriptions/${subId}`);
  await upsertSubscription(env, sub);
  const account = await findAccountFor(env, customerId(inv.customer) || customerId(sub.customer), sub.metadata && sub.metadata.account_id);
  if (!account) return "no account";
  const lines = (inv.lines && inv.lines.data) || [];
  const ours = lines.filter((l) => Number(l.amount) > 0 && planByPrice(env, linePriceId(l)));
  const line = ours[ours.length - 1] || null;
  const plan = planByPrice(env, (line && linePriceId(line)) || subPriceId(sub));
  if (!plan) return "unknown price";
  const sp = subPeriod(sub);
  const start = isoFromUnix((line && line.period && line.period.start) || sp.start);
  const end = isoFromUnix((line && line.period && line.period.end) || sp.end);
  if (!start || !end) return "no period";
  const reason = inv.billing_reason;
  const insert = (kind, papers, s, e) => dbRun(env, `INSERT OR IGNORE INTO individual_periods
      (id, account_id, stripe_invoice_id, kind, plan_key, period_start, period_end, papers_allowed, papers_used, amount_paid, voided, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?)`,
    crypto.randomUUID(), account.id, inv.id, kind, plan.key, s, e, papers, Number(inv.amount_paid) || 0, nowIso());
  if (reason === "subscription_create" || reason === "subscription_cycle") {
    const r = await insert("grant", plan.papers, start, end);
    return changes(r) ? `granted ${plan.papers} (${plan.key})` : "already granted";
  }
  if (reason === "subscription_update") {
    // Upgrade paid through the Customer Portal (prorated). Same interval: top up the difference.
    // Interval change (monthly -> yearly): Stripe starts a new period, so the new plan's full allowance replaces the old one.
    const cur = (await currentPeriods(env, account.id)).filter((p) => p.kind === "grant").pop();
    const curPlan = cur ? planByKey(env, cur.plan_key) : null;
    if (cur && curPlan && curPlan.interval === plan.interval) {
      const topup = Math.max(0, plan.papers - curPlan.papers);
      if (!topup) { await insert("upgrade_noop", 0, start, cur.period_end); return "no top-up needed"; }
      const r = await insert("upgrade_topup", topup, nowIso(), cur.period_end);
      return changes(r) ? `topped up ${topup}` : "already granted";
    }
    if (cur) await dbRun(env, "UPDATE individual_periods SET voided = 1 WHERE id = ?", cur.id);
    const r = await insert("grant", plan.papers, isoFromUnix(sp.start) || start, isoFromUnix(sp.end) || end);
    return changes(r) ? `granted ${plan.papers} (${plan.key}, new interval)` : "already granted";
  }
  return "ignored billing_reason " + reason;
}

async function voidLatestPaidPeriod(env, account, amount) {
  const p = await dbOne(env, `SELECT id FROM individual_periods WHERE account_id = ? AND voided = 0 AND amount_paid = ?
    ORDER BY created_at DESC LIMIT 1`, account.id, Number(amount) || 0);
  if (!p) return false;
  await dbRun(env, "UPDATE individual_periods SET voided = 1 WHERE id = ?", p.id);
  return true;
}

export async function processStripeEvent(env, evt) {
  const o = evt.data && evt.data.object;
  switch (evt.type) {
    case "checkout.session.completed": {
      if (!o || o.mode !== "subscription") return "ignored (not subscription)";
      const account = await findAccountFor(env, customerId(o.customer), o.client_reference_id || (o.metadata && o.metadata.account_id));
      if (!account) return "no account";
      if (o.subscription) await upsertSubscription(env, await stripeCall(env, "GET", `/v1/subscriptions/${customerId(o.subscription)}`));
      if (o.invoice) return "checkout: " + await grantFromInvoice(env, await stripeCall(env, "GET", `/v1/invoices/${customerId(o.invoice)}`));
      return "checkout linked";
    }
    case "invoice.paid":
      return grantFromInvoice(env, o);
    case "invoice.payment_failed": {
      const a = await accountByCustomer(env, customerId(o.customer));
      if (!a) return "no account";
      if (a.status === "active") await dbRun(env, "UPDATE individual_accounts SET status = 'past_due', updated_at = ? WHERE id = ?", nowIso(), a.id);
      return "marked past_due (no new papers until paid)";
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return upsertSubscription(env, o);
    case "charge.refunded": {
      const a = await accountByCustomer(env, customerId(o.customer));
      if (!a) return "no account";
      const full = o.refunded === true || Number(o.amount_refunded) >= Number(o.amount);
      if (!full) return "partial refund recorded only (provisional)";
      return (await voidLatestPaidPeriod(env, a, o.amount)) ? "full refund: period voided" : "full refund: no matching period";
    }
    case "charge.dispute.created": {
      const ch = await stripeCall(env, "GET", `/v1/charges/${customerId(o.charge)}`);
      const a = await accountByCustomer(env, customerId(ch.customer));
      if (!a) return "no account";
      await dbRun(env, "UPDATE individual_accounts SET status = 'paused', paused_reason = 'dispute', updated_at = ? WHERE id = ?", nowIso(), a.id);
      await dbRun(env, "DELETE FROM individual_sessions WHERE account_id = ?", a.id);
      return "paused for dispute";
    }
    case "charge.dispute.closed": {
      const ch = await stripeCall(env, "GET", `/v1/charges/${customerId(o.charge)}`);
      const a = await accountByCustomer(env, customerId(ch.customer));
      if (!a) return "no account";
      if (o.status === "won") {
        const s = await dbOne(env, "SELECT status FROM individual_subscriptions WHERE account_id = ? ORDER BY updated_at DESC LIMIT 1", a.id);
        await dbRun(env, "UPDATE individual_accounts SET status = ?, paused_reason = NULL, updated_at = ? WHERE id = ?", mapStatus(s && s.status) || "active", nowIso(), a.id);
        return "dispute won: unpaused";
      }
      if (o.status === "lost") { await voidLatestPaidPeriod(env, a, ch.amount); return "dispute lost: period voided, account stays paused"; }
      return "dispute closed: " + o.status;
    }
    default:
      return "ignored";
  }
}

async function handleWebhook(request, env, json) {
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: "Webhook not configured." }, 503);
  const raw = await request.text();
  const ok = await verifyStripeSignature(env.STRIPE_WEBHOOK_SECRET, request.headers.get("Stripe-Signature") || "", raw);
  if (!ok) return json({ error: "Bad signature." }, 400);
  let evt;
  try { evt = JSON.parse(raw); } catch { return json({ error: "Bad JSON." }, 400); }
  if (!evt || !evt.id || !evt.type) return json({ error: "Bad event." }, 400);
  if (evt.livemode && env.STRIPE_MODE !== "live") return json({ error: "Live event refused on test server." }, 400);
  if (!evt.livemode && env.STRIPE_MODE === "live") return json({ error: "Test event refused on live server." }, 400);
  await ensureIndividualSchema(env);
  const ins = await dbRun(env, "INSERT OR IGNORE INTO stripe_events (id, type, livemode, received_at) VALUES (?, ?, ?, ?)",
    evt.id, evt.type, evt.livemode ? 1 : 0, nowIso());
  if (!changes(ins)) {
    const prev = await dbOne(env, "SELECT processed_at FROM stripe_events WHERE id = ?", evt.id);
    if (prev && prev.processed_at) return json({ received: true, duplicate: true }, 200);
  }
  try {
    const result = await processStripeEvent(env, evt);
    await dbRun(env, "UPDATE stripe_events SET processed_at = ?, result = ? WHERE id = ?", nowIso(), String(result).slice(0, 200), evt.id);
    return json({ received: true }, 200);
  } catch (e) {
    console.log("webhook processing failed", evt.type, e.status || "", e.message && e.message.slice(0, 80)); // no card or student data
    await dbRun(env, "UPDATE stripe_events SET result = ? WHERE id = ?", "error: " + String(e.message || "").slice(0, 120), evt.id);
    return json({ error: "Processing failed; Stripe will retry." }, 500);
  }
}

// ---------------------------------------------------------------------------------------------
// Public routes
function baseUrl(env, request) { return env.PUBLIC_BASE_URL || new URL(request.url).origin; }
// Where teachers land after Checkout / the billing portal. Production: the gradealong.com teacher page (TEACHER_PAGE_URL).
function teacherUrl(env, request) { return env.TEACHER_PAGE_URL || baseUrl(env, request) + "/teacher"; }
async function publicAccount(env, a) {
  const sub = await dbOne(env, "SELECT plan_key, status, current_period_end, cancel_at_period_end FROM individual_subscriptions WHERE account_id = ? ORDER BY updated_at DESC LIMIT 1", a.id);
  return {
    email: a.email, status: a.status, plan: a.plan_key,
    subscription: sub ? { plan: sub.plan_key, status: sub.status, renewsOrEnds: sub.current_period_end, cancelAtPeriodEnd: !!sub.cancel_at_period_end } : null,
    usage: await individualUsage(env, a)
  };
}

export async function routeIndividual(url, request, env, origin, deps) {
  const p = url.pathname;
  const isOurs = p === "/teacher" || p === "/stripe/webhook" || p.startsWith("/individual/") || p === "/owner/individuals";
  if (!isOurs) return null;
  const json = (obj, status = 200) => deps.json(obj, status, origin);
  if (p === "/teacher" && request.method === "GET") {
    if (env.APP_ENV !== "staging") return json({ error: "Not found." }, 404);
    return new Response(TEST_PAGE_HTML, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  }
  if (!billingEnabled(env)) {
    if (p === "/individual/plans" && request.method === "GET") return json({ ok: true, available: false, plans: [] });
    return json({ error: "Teacher plans are not available yet.", available: false }, 503);
  }
  await ensureIndividualSchema(env);
  if (p === "/stripe/webhook") {
    if (request.method !== "POST") return json({ error: "Use POST." }, 405);
    return handleWebhook(request, env, json);
  }
  if (p === "/individual/plans" && request.method === "GET") {
    return json({ ok: true, available: true, mode: env.STRIPE_MODE || "test", pricesStatus: env.PLAN_PRICES_STATUS || null,
      plans: plans(env).map(({ key, label, papers, interval, amount }) => ({ key, label, papers, interval, amount })) });
  }
  if (request.method !== "POST" && !(p === "/individual/me" || p === "/owner/individuals")) return json({ error: "Use POST." }, 405);
  if (origin && !deps.originAllowed(origin)) return json({ error: "Origin not allowed." }, 403);

  const limited = await deps.rateLimit(request, env, p.startsWith("/individual/signin") ? "auth:" : "ind:");
  if (limited) return limited(origin);
  let body = {};
  if (request.method === "POST") { try { body = await request.json(); } catch { body = {}; } }
  try {
    if (p === "/individual/checkout") return await routeCheckout(request, env, body, json);
    if (p === "/individual/confirm") return await routeConfirm(env, body, json);
    if (p === "/individual/signin") return await routeSignin(env, body, json);
    if (p === "/owner/individuals") {
      const auth = await deps.authorize(request, env);
      if (!auth.ok || auth.kind !== "passcode") return json({ error: "Only Arrival House can do that. Use the teacher passcode." }, 403);
      const rows = await dbAll(env, "SELECT id, email, status, plan_key, paused_reason, created_at, delete_after FROM individual_accounts ORDER BY created_at DESC LIMIT 200");
      const out = [];
      for (const r of rows) out.push({ ...r, usage: await individualUsage(env, r) });
      return json({ ok: true, accounts: out, provisional: PROVISIONAL });
    }
    // Signed-in routes
    const sess = await loadIndividualSession(env, (request.headers.get("X-Teacher-Session") || "").trim());
    if (!sess) return json({ error: "Sign in again." }, 401);
    const a = sess.account;
    if (p === "/individual/me") {
      const recent = await dbAll(env, "SELECT id, kind, state, created_at FROM individual_usage WHERE account_id = ? ORDER BY created_at DESC LIMIT 5", a.id);
      return json({ ok: true, account: await publicAccount(env, a), recentUsage: recent });
    }
    if (p === "/individual/logout") {
      await dbRun(env, "DELETE FROM individual_sessions WHERE id = ?", sess.sessionId);
      return json({ ok: true });
    }
    if (p === "/individual/portal") {
      if (!a.stripe_customer_id) return json({ error: "No billing account yet." }, 409);
      const params = { customer: a.stripe_customer_id, return_url: teacherUrl(env, request) };
      if (env.STRIPE_PORTAL_CONFIG) params.configuration = env.STRIPE_PORTAL_CONFIG;
      const ps = await stripeCall(env, "POST", "/v1/billing_portal/sessions", params);
      return json({ ok: true, url: ps.url });
    }
    if (p === "/individual/recovery/rotate") {
      const code = recoveryCode();
      await dbRun(env, "UPDATE individual_accounts SET recovery_hash = ?, updated_at = ? WHERE id = ?", await hmacHex(env.SESSION_SECRET, "ind-recovery:" + normCode(code)), nowIso(), a.id);
      return json({ ok: true, signinCode: code, note: "Save this code. It replaces the old one." });
    }
    if (p === "/individual/usage/flag") return await routeFlag(env, a, body, json);
    return json({ error: "Not found." }, 404);
  } catch (e) {
    if (e.guard) return json({ error: e.message }, 503);
    console.log("individual route failed", p, e.status || "", (e.stripe && e.stripe.code) || ""); // no secrets, no student data
    const body = { error: e.status && e.status < 500 ? "The payment service rejected the request." : "Server error." };
    if (env.APP_ENV === "staging" && e.stripe) body.stripeError = { type: e.stripe.type || null, code: e.stripe.code || null, param: e.stripe.param || null, message: e.stripe.message || null }; // staging diagnostics, no secrets
    return json(body, e.status && e.status < 500 ? 400 : 500);
  }
}

async function routeCheckout(request, env, body, json) {
  const blocked = stripeGuard(env);
  if (blocked) return json({ error: blocked }, 503);
  const email = cleanEmail(body.email);
  if (!email) return json({ error: "Enter a valid email." }, 400);
  const plan = planByKey(env, String(body.plan || ""));
  if (!plan) return json({ error: "Choose a plan." }, 400);
  if (body.agree !== true) return json({ error: "Please agree to the Terms to continue." }, 400);
  let a = await accountByEmail(env, email);
  if (a) {
    const live = await dbOne(env, "SELECT id FROM individual_subscriptions WHERE account_id = ? AND status IN ('active','trialing','past_due','unpaid') LIMIT 1", a.id);
    if (live || a.status === "paused") return json({ error: "This email already has a plan. Sign in with your sign-in code, or use Manage billing.", existing: true }, 409);
  } else {
    const id = crypto.randomUUID();
    await dbRun(env, "INSERT INTO individual_accounts (id, email, status, terms_version, terms_accepted_at, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?, ?, ?)",
      id, email, String(body.termsVersion || "staging-draft").slice(0, 40), nowIso(), nowIso(), nowIso());
    a = await accountById(env, id);
  }
  if (!a.stripe_customer_id) {
    const cus = await stripeCall(env, "POST", "/v1/customers", { email, metadata: { account_id: a.id, app: "grade-along" } }, "ga-cus-" + a.id);
    await dbRun(env, "UPDATE individual_accounts SET stripe_customer_id = ?, updated_at = ? WHERE id = ?", cus.id, nowIso(), a.id);
    a.stripe_customer_id = cus.id;
  }
  const tpage = teacherUrl(env, request);
  const common = {
    mode: "subscription",
    customer: a.stripe_customer_id,
    client_reference_id: a.id,
    line_items: [{ price: plan.priceId, quantity: 1 }],
    allow_promotion_codes: "false",
    // Stripe Tax ON (Don, Nov 23, 2026, t571u). Tax location = billing address collected here and saved to the
    // existing Customer (customer_update.address=auto), per docs.stripe.com/tax/checkout/page. The subscription
    // Checkout creates inherits automatic tax for renewals. Off switch: STRIPE_TAX=off.
    billing_address_collection: env.STRIPE_TAX === "off" ? "auto" : "required",
    ...(env.STRIPE_TAX === "off" ? {} : { automatic_tax: { enabled: true }, customer_update: { address: "auto" } }),
    success_url: tpage + "?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: tpage + "?canceled=1",
    metadata: { account_id: a.id, plan_key: plan.key, app: "grade-along" },
    subscription_data: { metadata: { account_id: a.id, plan_key: plan.key, app: "grade-along" } }
  };
  // Cards only (Don approved Nov 23, 2026, t566u). Link (incl. Link's "Bank" option) is hidden with
  // wallet_options.link.display=never (Checkout param since 2025-04-30.basil). payment_method_types was
  // removed from Checkout in 2026-09-30.endive; on that version we fall back to allowed_payment_method_types.
  const variants = [
    { v: "pmt+wallet", p: { payment_method_types: ["card"], wallet_options: { link: { display: "never" } } } },
    { v: "allowed+wallet", p: { allowed_payment_method_types: ["card"], wallet_options: { link: { display: "never" } } } },
    { v: "pmt", p: { payment_method_types: ["card"] } }
  ];
  let s = null, used = null, lastErr = null;
  for (const x of variants) {
    try { s = await stripeCall(env, "POST", "/v1/checkout/sessions", { ...common, ...x.p }); used = x.v; break; }
    catch (e) { lastErr = e; if (e.status !== 400) throw e; }
  }
  if (!s) throw lastErr;
  const out = { ok: true, url: s.url };
  if (env.APP_ENV === "staging") out.checkoutCheck = { variant: used, paymentMethodTypes: s.payment_method_types || null,
    linkDisplay: (s.wallet_options && s.wallet_options.link && s.wallet_options.link.display) || null, livemode: s.livemode,
    automaticTax: s.automatic_tax ? { enabled: !!s.automatic_tax.enabled, status: s.automatic_tax.status || null } : null,
    billingAddressCollection: s.billing_address_collection || null };
  return json(out);
}

async function routeConfirm(env, body, json) {
  const id = String(body.sessionId || "");
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return json({ error: "Bad checkout reference." }, 400);
  const s = await stripeCall(env, "GET", `/v1/checkout/sessions/${id}`);
  if (s.status !== "complete" || !(s.payment_status === "paid" || s.payment_status === "no_payment_required")) {
    return json({ error: "Payment isn't finished yet.", status: s.status, paymentStatus: s.payment_status }, 409);
  }
  const a = await findAccountFor(env, customerId(s.customer), s.client_reference_id);
  if (!a || a.id !== s.client_reference_id) return json({ error: "Account not found for this checkout." }, 404);
  // Same fulfillment the webhook runs (idempotent).
  if (s.subscription) await upsertSubscription(env, await stripeCall(env, "GET", `/v1/subscriptions/${customerId(s.subscription)}`));
  let grant = "no invoice";
  if (s.invoice) grant = await grantFromInvoice(env, await stripeCall(env, "GET", `/v1/invoices/${customerId(s.invoice)}`));
  const fresh = await accountById(env, a.id);
  if (fresh.confirm_session_id === id && fresh.confirm_used_at) {
    // A checkout link can sign someone in only once; after that, the sign-in code is needed.
    return json({ ok: true, alreadyConfirmed: true, account: await publicAccount(env, fresh), note: "Already set up. Sign in with your sign-in code." });
  }
  const code = recoveryCode();
  await dbRun(env, "UPDATE individual_accounts SET confirm_session_id = ?, confirm_used_at = ?, recovery_hash = ?, status = CASE WHEN status = 'pending' THEN 'active' ELSE status END, updated_at = ? WHERE id = ?",
    id, nowIso(), await hmacHex(env.SESSION_SECRET, "ind-recovery:" + normCode(code)), nowIso(), a.id);
  const token = await issueSession(env, a.id);
  return json({ ok: true, token, signinCode: code, grant, account: await publicAccount(env, await accountById(env, a.id)) });
}

async function routeSignin(env, body, json) {
  const email = cleanEmail(body.email);
  const code = normCode(body.code);
  const fail = () => json({ error: "That email and sign-in code don't match." }, 401);
  if (!email || code.length < 12) return fail();
  const a = await accountByEmail(env, email);
  if (!a || !a.recovery_hash || a.status === "closed") return fail();
  if (a.signin_locked_until && a.signin_locked_until > nowIso()) return json({ error: "Too many tries. Wait 15 minutes." }, 429);
  const h = await hmacHex(env.SESSION_SECRET, "ind-recovery:" + code);
  if (!timingSafeEqualStr(h, a.recovery_hash)) {
    const fails = (a.signin_fails || 0) + 1;
    const lock = fails >= PROVISIONAL.SIGNIN_MAX_FAILS ? new Date(Date.now() + PROVISIONAL.SIGNIN_LOCK_MS).toISOString() : null;
    await dbRun(env, "UPDATE individual_accounts SET signin_fails = ?, signin_locked_until = ? WHERE id = ?", lock ? 0 : fails, lock, a.id);
    return fail();
  }
  await dbRun(env, "UPDATE individual_accounts SET signin_fails = 0, signin_locked_until = NULL WHERE id = ?", a.id);
  const token = await issueSession(env, a.id);
  return json({ ok: true, token, account: await publicAccount(env, a) });
}

const FLAG_REASONS = ["wrong_student", "misread_page", "garbled_text", "other"];
async function routeFlag(env, a, body, json) {
  const usageId = String(body.usageId || "");
  const reason = FLAG_REASONS.includes(body.reason) ? body.reason : "";
  if (!usageId || !reason) return json({ error: "Choose the paper and a reason." }, 400);
  const u = await dbOne(env, "SELECT * FROM individual_usage WHERE id = ? AND account_id = ?", usageId, a.id);
  if (!u || u.state !== "charged") return json({ error: "That paper can't be flagged." }, 404);
  if (Date.now() - Date.parse(u.created_at) > PROVISIONAL.FLAG_WINDOW_MS) return json({ error: "Only papers from the last 24 hours can be flagged." }, 400);
  const usage = await individualUsage(env, a);
  const cap = Math.max(1, Math.min(PROVISIONAL.FLAG_CAP_MAX, Math.floor(usage.papersAllowed * PROVISIONAL.FLAG_CAP_PCT)));
  const n = await dbOne(env, "SELECT COUNT(*) AS n FROM individual_credit_flags WHERE account_id = ? AND restored = 1 AND created_at >= ?", a.id, monthStartIso());
  const restore = (n ? n.n : 0) < cap;
  const ins = await dbRun(env, "INSERT OR IGNORE INTO individual_credit_flags (id, account_id, usage_id, reason, restored, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    crypto.randomUUID(), a.id, usageId, reason, restore ? 1 : 0, nowIso());
  if (!changes(ins)) return json({ error: "Already flagged." }, 409);
  if (restore) {
    await dbRun(env, "UPDATE individual_usage SET state = 'restored' WHERE id = ? AND state = 'charged'", usageId);
    await dbRun(env, "UPDATE individual_periods SET papers_used = CASE WHEN papers_used > 0 THEN papers_used - 1 ELSE 0 END WHERE id = ?", u.period_id);
  }
  return json({ ok: true, restored: restore, cap, usage: await individualUsage(env, a),
    note: restore ? "Thanks. The paper was added back." : `Thanks. Flag saved, but you've reached ${cap} paper returns this month.` });
}

// Daily retention for individual accounts (called from scheduled(); staging has no cron).
export async function runIndividualRetention(env) {
  if (!env.DB) return { deleted: 0 };
  if (!billingEnabled(env)) {
    // Inert: only run if the tables already exist (billing turned off after use); never create them here.
    const has = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'individual_accounts'").first();
    if (!has) return { deleted: 0, skipped: "billing not enabled" };
  } else await ensureIndividualSchema(env);
  const due = await dbAll(env, "SELECT id FROM individual_accounts WHERE delete_after IS NOT NULL AND delete_after < ?", nowIso());
  for (const r of due) {
    for (const t of ["individual_usage", "individual_periods", "individual_sessions", "individual_credit_flags", "individual_daily_free", "individual_subscriptions"]) {
      await dbRun(env, `DELETE FROM ${t} WHERE account_id = ?`, r.id);
    }
    await dbRun(env, "DELETE FROM individual_accounts WHERE id = ?", r.id);
  }
  return { deleted: due.length };
}

// ---------------------------------------------------------------------------------------------
// Minimal staging test page (served only when APP_ENV=staging). Not the real gradealong.com UI.
const TEST_PAGE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Grade Along — teacher plans (STAGING TEST)</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#1d2433}
.banner{background:#fff3cd;border:1px solid #e0c36a;padding:10px 12px;border-radius:8px;margin-bottom:16px}
fieldset{border:1px solid #d0d7e2;border-radius:8px;margin:14px 0;padding:12px}label{display:block;margin:6px 0}
button{padding:8px 14px;border-radius:6px;border:1px solid #2b4c9b;background:#2b4c9b;color:#fff;cursor:pointer;margin:4px 6px 4px 0}
button.secondary{background:#fff;color:#2b4c9b}input[type=email],input[type=text],textarea{width:100%;padding:7px;box-sizing:border-box}
.code{font-family:ui-monospace,monospace;font-size:18px;background:#eef3ff;padding:8px;border-radius:6px;display:inline-block}
#msg{margin:10px 0;color:#7a1b1b}.ok{color:#1b5e20!important}pre{background:#f5f7fa;padding:8px;border-radius:6px;white-space:pre-wrap}</style></head><body>
<div class="banner"><b>STAGING TEST.</b> Stripe sandbox only. No real card is ever charged. Prices locked; sales tax (Stripe Tax, sandbox) is added on top where applicable. Use fictional text only, no real student work.</div>
<h1>Grade Along for individual teachers</h1>
<div id="msg"></div>
<div id="signedout">
<fieldset><legend>Choose a plan</legend><div id="plans">Loading…</div>
<label>Email <input type="email" id="email" autocomplete="email" placeholder="you@example.com"></label>
<label><input type="checkbox" id="agree"> I agree to the Terms (staging draft) and that plans renew automatically until cancelled.</label>
<button id="buy">Continue to secure checkout</button></fieldset>
<fieldset><legend>Already have a plan? Sign in</legend>
<label>Email <input type="email" id="semail" autocomplete="email"></label>
<label>Sign-in code <input type="text" id="scode" placeholder="XXXX-XXXX-XXXX-XXXX" autocomplete="off"></label>
<button class="secondary" id="signin">Sign in</button></fieldset></div>
<div id="signedin" hidden>
<fieldset><legend>Your plan</legend><div id="me"></div>
<div id="codebox" hidden><p><b>Save your sign-in code.</b> You'll need it to sign in on another device. It's shown only once.</p><div class="code" id="code"></div></div>
<button id="portal">Manage billing (change plan, card, cancel, receipts)</button><button class="secondary" id="rotate">New sign-in code</button><button class="secondary" id="logout">Sign out</button></fieldset>
<fieldset><legend>Try grading (typed text)</legend><p>Uses one paper only when the AI returns a usable draft. On staging this needs an AI key, so it may say "AI key not configured".</p>
<label>First name (fictional) <input type="text" id="gname" value="Testy"></label>
<textarea id="gtext" rows="5">Once upon a time a small robot found a lost kite and flew it all the way home.</textarea>
<button id="grade">Grade with AI</button><button class="secondary" id="flag">Flag last paper as a bad result</button><pre id="gout"></pre></fieldset></div>
<script>
const API = location.origin; const $ = (id) => document.getElementById(id);
const tok = () => localStorage.getItem("ga_ind_token") || "";
const msg = (t, ok) => { $("msg").textContent = t || ""; $("msg").className = ok ? "ok" : ""; };
async function api(path, body, method) {
  const r = await fetch(API + path, { method: method || (body ? "POST" : "GET"), headers: { "Content-Type": "application/json", "X-Teacher-Session": tok() }, body: body ? JSON.stringify(body) : undefined });
  let d = {}; try { d = await r.json(); } catch {}
  return { status: r.status, d };
}
const money = (c, i) => "$" + (c / 100).toFixed(2) + "/" + (i === "month" ? "month" : "year");
async function loadPlans() {
  const { d } = await api("/individual/plans");
  $("plans").innerHTML = (d.plans || []).map((p, i) => '<label><input type="radio" name="plan" value="' + p.key + '"' + (i ? "" : " checked") + "> " + p.label + " — " + p.papers + " papers per " + p.interval + " — " + money(p.amount, p.interval) + " + tax</label>").join("") || "No plans configured.";
}
let lastUsage = "";
async function showMe() {
  const { status, d } = await api("/individual/me");
  if (status !== 200) { localStorage.removeItem("ga_ind_token"); $("signedin").hidden = true; $("signedout").hidden = false; return; }
  $("signedout").hidden = true; $("signedin").hidden = false;
  const a = d.account, u = a.usage, s = a.subscription;
  $("me").innerHTML = "<p><b>" + a.email + "</b> — status: " + a.status + "</p><p>Plan: " + (s ? s.plan + " (" + s.status + (s.cancelAtPeriodEnd ? ", cancels at period end" : "") + ")" : "none") + "</p><p>Papers left: <b>" + u.papersLeft + "</b> of " + u.papersAllowed + (u.periodEnd ? " — until " + new Date(u.periodEnd).toLocaleDateString() : "") + "</p>";
  const c = (d.recentUsage || []).find((x) => x.state === "charged"); lastUsage = c ? c.id : "";
}
$("buy").onclick = async () => {
  const plan = (document.querySelector('input[name=plan]:checked') || {}).value;
  msg("Opening checkout…", true);
  const { status, d } = await api("/individual/checkout", { email: $("email").value, plan, agree: $("agree").checked, termsVersion: "staging-draft" });
  if (status === 200 && d.url) location.href = d.url; else msg(d.error || "Could not start checkout.");
};
$("signin").onclick = async () => {
  const { status, d } = await api("/individual/signin", { email: $("semail").value, code: $("scode").value });
  if (status === 200) { localStorage.setItem("ga_ind_token", d.token); msg("Signed in.", true); showMe(); } else msg(d.error || "Sign-in failed.");
};
$("portal").onclick = async () => { const { status, d } = await api("/individual/portal", {}); if (status === 200) location.href = d.url; else msg(d.error || "Could not open billing."); };
$("rotate").onclick = async () => { const { status, d } = await api("/individual/recovery/rotate", {}); if (status === 200) { $("codebox").hidden = false; $("code").textContent = d.signinCode; } else msg(d.error); };
$("logout").onclick = async () => { await api("/individual/logout", {}); localStorage.removeItem("ga_ind_token"); location.href = "/teacher"; };
$("grade").onclick = async () => {
  $("gout").textContent = "Working…";
  const { status, d } = await api("/grade", { firstName: $("gname").value, grade: "3", text: $("gtext").value });
  $("gout").textContent = status + " " + JSON.stringify(d, null, 2).slice(0, 1500); showMe();
};
$("flag").onclick = async () => {
  if (!lastUsage) { msg("No charged paper to flag yet."); return; }
  const { d } = await api("/individual/usage/flag", { usageId: lastUsage, reason: "other" }); msg(d.note || d.error, !!d.ok); showMe();
};
(async () => {
  await loadPlans();
  const q = new URLSearchParams(location.search);
  if (q.get("canceled")) msg("Checkout was cancelled. Nothing was charged.");
  const sid = q.get("session_id");
  if (sid) {
    msg("Finishing setup…", true);
    const { status, d } = await api("/individual/confirm", { sessionId: sid });
    history.replaceState(null, "", "/teacher");
    if (status === 200 && d.token) { localStorage.setItem("ga_ind_token", d.token); $("codebox").hidden = false; $("code").textContent = d.signinCode; msg("You're all set.", true); }
    else if (status === 200) msg(d.note || "Already set up.", true); else msg(d.error || "Could not finish setup.");
  }
  if (tok()) showMe();
})();
</script></body></html>`;
