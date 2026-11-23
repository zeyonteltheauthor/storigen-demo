// v24 browser checks: first-name-only everywhere, same-name warning + teacher initial,
// approved-only saving. Real page + real Worker (fake D1). Fictional names only.
// Needs a static server: python3 -m http.server 4173 --directory <repo root>
const { chromium } = require("playwright");
const { DatabaseSync } = require("node:sqlite");
const fs = require("fs"), path = require("path");
const assert = require("assert/strict");
const BASE = "http://127.0.0.1:4173/grade-along/";
const PASS = "e2e-" + Math.random().toString(36).slice(2);
let n = 0; const ok = (name, c) => { assert.ok(c, name); n++; console.log("PASS", name); };
if (!crypto.subtle.timingSafeEqual) crypto.subtle.timingSafeEqual = (a, b) => { const x = new Uint8Array(a), y = new Uint8Array(b); if (x.length !== y.length) return false; let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i]; return d === 0; };
function makeD1(db) {
  const wrap = (sql, params = []) => ({
    bind: (...p) => wrap(sql, p),
    async first() { return db.prepare(sql).get(...params) ?? null; },
    async all() { return { results: db.prepare(sql).all(...params) }; },
    async run() { const st = db.prepare(sql); if (/^\s*(select|pragma)/i.test(sql) || /returning/i.test(sql)) return { results: st.all(...params), meta: { changes: 0 } }; const r = st.run(...params); return { meta: { changes: Number(r.changes) } }; }
  });
  return { prepare: (sql) => wrap(sql), async exec(sql) { db.exec(sql); }, async batch(stmts) { for (const s of stmts) await s.run(); } };
}
(async () => {
  const worker = (await import(require("url").pathToFileURL(path.join(__dirname, "../worker/src/index.js")).href)).default;
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(path.join(__dirname, "fixtures/schema-v22.sql"), "utf8"));
  const env = { DB: makeD1(db), TEACHER_PASSCODE: PASS, SESSION_SECRET: "s".repeat(32) };
  let ip = 0;
  const wcall = async (p, body, headers = {}) => { const r = await worker.fetch(new Request("https://x" + p, { method: "POST", headers: { Origin: "https://gradealong.com", "Content-Type": "application/json", "CF-Connecting-IP": "10.9.9." + (++ip), ...headers }, body: JSON.stringify(body) }), env); return r.json(); };
  const made = await wcall("/owner/schools", { name: "ZZ v24 E2E", paperAllowance: 10, adminName: "Admin", adminEmail: "a@example.invalid" }, { "X-Teacher-Passcode": PASS });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, serviceWorkers: "block" });
  const posts = [];
  await ctx.route("https://grade-along-api.storigen.workers.dev/**", async (route) => {
    const r = route.request();
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, X-Teacher-Passcode, X-Teacher-Session", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
    if (r.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (r.url().endsWith("/school/scores")) posts.push(JSON.parse(r.postData()));
    const req = new Request(r.url(), { method: r.method(), headers: { ...r.headers(), origin: "https://gradealong.com", "cf-connecting-ip": "10.8.8." + (++ip % 250) }, body: ["GET", "HEAD"].includes(r.method()) ? undefined : r.postData() });
    const res = await worker.fetch(req, env);
    return route.fulfill({ status: res.status, headers: { "Content-Type": "application/json", ...cors }, body: await res.text() });
  });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  page.on("download", () => {});

  await page.goto(BASE);
  ok("v24 label", (await page.locator(".version-label").first().innerText()).includes("Grade Along v24"));
  await page.fill("#gate-email", "a@example.invalid");
  await page.fill("#gate-code", made.inviteCode);
  await page.click("#gate-school-go");
  await page.waitForFunction(() => window.GA_SCHOOL && window.GA_SCHOOL.token, null, { timeout: 15000 });
  await page.click("#mode-teacher");

  // Typed name: full name -> first name, with a note.
  await page.fill("#t-name", "Testy Mae Brown");
  await page.press("#t-name", "Tab");
  ok("typed full name trimmed to first name", (await page.inputValue("#t-name")) === "Testy");
  ok("note says only the first name is kept", /Only the first name is kept/.test(await page.locator("#t-name-note").innerText()));
  await page.fill("#t-name", "Brown, Testy Mae");
  await page.press("#t-name", "Tab");
  ok("'Last, First Middle' -> First", (await page.inputValue("#t-name")) === "Testy");

  // Helpers + cover + filename + split label.
  const h = await page.evaluate(() => { const { firstOnly, nameFromFile, blankStudent, applyCover, initialOnly } = window.__GA_TEST; const students = window.__GA_TEST.students(); return ({
    a: firstOnly("Testy Mae Brown"), b: firstOnly("Brown, Testy Mae"), c: firstOnly("  Ivy   Mae "), d: nameFromFile("Testy_Mae_Brown.jpg"),
    e: (() => { const st = blankStudent(); students.push(st); applyCover(st, { firstName: "Brown, Ivy Mae", grade: "3" }); const v = st.student; students.pop(); return v; })(),
    i: initialOnly("b"), j: initialOnly("Brown")
  }); });
  ok("firstOnly / nameFromFile / cover read", h.a === "Testy" && h.b === "Testy" && h.c === "Ivy" && h.d === "Testy" && h.e === "Ivy");
  ok("initial only from a typed single letter", h.i === "B" && h.j === "");

  // Same-name warning, cleared by a teacher-entered initial.
  await page.evaluate(() => { const T = window.__GA_TEST; const st = T.blankStudent(); st.student = "Testy"; st.soft = {}; T.students().push(st); T.renderQueue(); T.renderNameNote(); });
  ok("same-name warning shown", /also named Testy/.test(await page.locator("#t-name-note").innerText()));
  ok("queue marks the duplicate", (await page.evaluate(() => window.__GA_TEST.students().map(window.__GA_TEST.displayName).join("|"))).includes("⚠"));
  await page.fill("#t-initial", "b");
  ok("initial clears the warning", !/also named/.test(await page.locator("#t-name-note").innerText()));
  ok("initial stored as one upper-case letter, not from paper", (await page.evaluate(() => window.__GA_TEST.state().initial)) === "B");

  // AI text with the full name is scrubbed; printed report + CSV show first name + teacher initial only.
  await page.evaluate(() => {
    const state = window.__GA_TEST.state();
    window.__GA_TEST.applyAI({ rows: [1, 2, 3, 4].map((k) => ({ score: 3, comment: k === 1 ? "Testy Mae Brown uses vivid details." : "Nice work, Testy Brown." })), overallFeedback: "Great work, Testy Mae Brown! The ending works.", transcriptionNote: "", storySummary: "Testy Mae Brown wrote about a dog.", studentFacingFeedback: "Keep going, Testy Brown!", model: "m" }, state);
  });
  const shown = await page.evaluate(() => { const state = window.__GA_TEST.state(); return JSON.stringify([state.feedback, state.overall, state.storySummary, state.studentFacingFeedback]); });
  ok("AI feedback scrubbed in the browser", !/Mae|Brown/.test(shown) && /Testy uses vivid details/.test(shown));
  const rep = await page.evaluate(() => window.__GA_TEST.buildReport(window.__GA_TEST.state()).textContent);
  ok("printed report: first name + teacher initial, no full name", rep.includes("Testy B.") && !/Mae|Brown/.test(rep));
  const csv = await page.evaluate(() => window.__GA_TEST.csvAll());
  ok("CSV: no full name", csv.includes("Testy B.") && !/Mae|Brown/.test(csv));
  const json = await page.evaluate(() => JSON.stringify(window.__GA_TEST.payload()));
  ok("JSON download: no full name", !/Mae|Brown/.test(json));

  // Approved-only saving: state approved, the other Testy not approved.
  await page.evaluate(() => {
    const state = window.__GA_TEST.state(), students = window.__GA_TEST.students();
    state.scores = [3, 3, 3, 3]; state.approved = true;
    const other = students.find((x) => x !== state); other.scores = [2, 2, 2, 2]; other.approved = false;
  });
  await page.click("#q-save-scores");
  await page.waitForTimeout(1500);
  ok("save shows skipped unapproved count", /Skipped 1 not approved yet/.test(await page.locator("#q-progress").innerText()));
  ok("only the approved student was sent to the server", posts.length === 1 && posts[0].approved === true && posts[0].firstName === "Testy" && posts[0].lastInitial === "B" && posts[0].rosterId);
  const rows = db.prepare("SELECT first_name, last_initial, approved FROM scores").all();
  ok("server stored one approved row, first name only", rows.length === 1 && rows[0].first_name === "Testy" && rows[0].last_initial === "B" && rows[0].approved === 1);
  const hist = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes("history")).map((k) => localStorage.getItem(k)).join(""));
  ok("device history has only the approved student", (hist.match(/"firstName"/g) || []).length === 1 && !/Mae|Brown/.test(hist));
  ok("no page errors", errors.length === 0 || (console.log(errors), false));
  await browser.close();
  console.log(`\n${n} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
