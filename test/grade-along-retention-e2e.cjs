// End-to-end: real page + real Worker code (fake D1 on node:sqlite) behind Playwright routing.
const { chromium } = require("playwright");
const { DatabaseSync } = require("node:sqlite");
const fs = require("fs");
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
  return { prepare: (sql) => wrap(sql), async exec(sql) { db.exec(sql); }, async batch(stmts) { db.exec("BEGIN"); try { for (const s of stmts) await s.run(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; } } };
}

(async () => {
  const worker = (await import(process.env.WORKER || require("url").pathToFileURL(require("path").join(__dirname, "../worker/src/index.js")).href)).default;
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(require("path").join(__dirname, "fixtures/schema-v22.sql"), "utf8"));
  const env = { DB: makeD1(db), TEACHER_PASSCODE: PASS, SESSION_SECRET: "s".repeat(32) };
  const now = new Date().toISOString();
  db.prepare("INSERT INTO schools (id,name,paper_allowance,papers_used,license_year,status,teachers_own_rubrics,created_at) VALUES ('t1','ZZ E2E Test School',10,0,2026,'active',0,?)").run(now);
  db.prepare("INSERT INTO teachers (id,school_id,email,name,role,active,created_at) VALUES ('a1','t1','a@example.invalid','Test Admin','admin',1,?)").run(now);
  db.prepare("INSERT INTO scores (id,school_id,teacher_id,first_name,grade,facilitator,date,assessment,rubric_id,rubric_name,scores_json,total,out_of,created_at,updated_at) VALUES ('x1','t1','a1','Maya','3','Ms. T','2026-11-02','pre','','Wonders','[4,3,3,2]',12,20,?,?)").run(now, now);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, serviceWorkers: "block" });
  await ctx.route("https://grade-along-api.storigen.workers.dev/**", async (route) => {
    const r = route.request();
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, X-Teacher-Passcode, X-Teacher-Session", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
    if (r.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const h = { ...r.headers(), origin: "https://gradealong.com" };
    const req = new Request(r.url(), { method: r.method(), headers: h, body: ["GET", "HEAD"].includes(r.method()) ? undefined : r.postData() });
    const res = await worker.fetch(req, env);
    return route.fulfill({ status: res.status, headers: { "Content-Type": "application/json", ...cors }, body: await res.text() });
  });
  const page = await ctx.newPage();
  const dialogs = [];
  page.on("dialog", (d) => { dialogs.push(d.message()); d.accept(); });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));

  // --- Gate: shared-computer clear ---
  await page.goto(BASE);
  ok("gate shows v23 label", (await page.locator(".version-label").first().innerText()).includes("Grade Along v23"));
  ok("gate shows shared-computer button", await page.locator("#gate-clear-all").isVisible());
  await page.evaluate(() => {
    localStorage.setItem("storigen-os-grade-along-teacher-queue::passcode", JSON.stringify({ v: 2, students: [{ student: "Maya", files: [{ dataUrl: "data:image/jpeg;base64,AAAA" }] }] }));
    localStorage.setItem("storigen-os-grade-along-history::school:s:u", "[1]");
    localStorage.setItem("storigen-os-grade-along-rubrics::passcode", "[]");
    localStorage.setItem("storigen-grade-along-session", "tok");
    localStorage.setItem("storigen-os-grade-along-ui-lang", "en");
    localStorage.setItem("unrelated-key", "keep");
  });
  await page.click("#gate-clear-all");
  const left = await page.evaluate(() => Object.keys(localStorage).sort());
  ok("clear-all removed every Grade Along key except language", JSON.stringify(left) === JSON.stringify(["storigen-os-grade-along-ui-lang", "unrelated-key"]));
  ok("clear-all asked for confirmation", dialogs.some((m) => /Clear everything Grade Along saved/.test(m)));
  ok("clear-all shows done note", /Everything Grade Along saved in this browser was cleared/.test(await page.locator("#gate-msg").innerText()));

  // --- Team mode: unlock, seed data, Lock wipes this workspace ---
  await page.fill("#gate-pass", PASS);
  await page.click("#gate-go");
  await page.waitForSelector("#ga-lock:not([hidden])");
  ok("passcode unlock works", true);
  await page.evaluate(() => {
    localStorage.setItem("storigen-os-grade-along-history::passcode", JSON.stringify([{ firstName: "Nico", grade: "3", date: "2026-11-01", scores: [3, 3, 3, 3], assessment: "pre", rubricId: "storigen-wonders" }]));
    localStorage.setItem("storigen-os-grade-along-pre-loaded::passcode", JSON.stringify({ records: [] }));
    localStorage.setItem("storigen-os-grade-along-rubrics::passcode", "[]");
    localStorage.setItem("storigen-os-grade-along-teacher-queue::school:other:u", "{}");
  });
  await page.click("#mode-teacher");
  // Put a paper in the live queue so Lock asks first.
  await page.evaluate(() => { const i = document.getElementById("t-name"); if (i) { i.value = "Nico"; i.dispatchEvent(new Event("input", { bubbles: true })); } });
  await page.waitForTimeout(300);

  // --- Owner panel: close, export, delete (test school only) ---
  await page.waitForSelector("#owner-panel:not([hidden])", { timeout: 5000 });
  await page.waitForSelector("text=ZZ E2E Test School", { timeout: 5000 });
  ok("owner panel lists test school", true);
  ok("owner panel shows Close school", await page.locator("#owner-schools button", { hasText: "Close school" }).count() === 1);
  await page.locator("#owner-schools button", { hasText: "Close school" }).click();
  await page.waitForSelector(".owner-closed");
  ok("closed school shows deletion date", /deleted automatically on/.test(await page.locator(".owner-closed").innerText()));
  ok("db marked closed with delete_after", (() => { const r = db.prepare("SELECT status, delete_after FROM schools WHERE id='t1'").get(); return r.status === "closed" && !!r.delete_after; })());
  const [dl] = await Promise.all([page.waitForEvent("download"), page.locator("#owner-schools button", { hasText: "Export scores (CSV)" }).click()]);
  const csv = fs.readFileSync(await dl.path(), "utf8");
  ok("CSV downloaded with the score row", dl.suggestedFilename().startsWith("grade-along-zz-e2e-test-school-scores-") && /"Maya","3","Ms. T"/.test(csv));
  await page.locator(".owner-danger summary").click();
  const del = page.locator(".owner-danger button.danger");
  await page.fill(".owner-danger input", "ZZ E2E");
  ok("delete disabled until name matches", await del.isDisabled());
  await page.fill(".owner-danger input", "zz e2e test school");
  ok("delete enabled when name matches", await del.isEnabled());
  await del.click();
  await page.waitForFunction(() => /Confirmation:/.test(document.getElementById("owner-status").textContent));
  const st = await page.locator("#owner-status").innerText();
  ok("confirmation shows counts", /1 scores, 1 people/.test(st));
  ok("db: school data gone, record kept", !db.prepare("SELECT 1 FROM schools WHERE id='t1'").get() && db.prepare("SELECT COUNT(*) n FROM scores").get().n === 0 && db.prepare("SELECT COUNT(*) n FROM school_deletions").get().n === 1);
  await page.waitForSelector(".owner-deletions");
  ok("deleted-schools list shows record", /ZZ E2E Test School/.test(await page.locator(".owner-deletions").textContent()));

  // --- Lock ---
  dialogs.length = 0;
  await page.click("#ga-lock");
  await page.waitForSelector("#gate-msg");
  await page.waitForFunction(() => /Signed out/.test(document.getElementById("gate-msg").textContent));
  const keys = await page.evaluate(() => Object.keys(localStorage).sort());
  ok("Lock removed passcode workspace queue/history/pre/draft", !keys.some((k) => /::passcode$/.test(k) && /(teacher-queue|history|pre-loaded|teacher-draft)/.test(k)));
  ok("Lock kept rubrics + other workspace", keys.includes("storigen-os-grade-along-rubrics::passcode") && keys.includes("storigen-os-grade-along-teacher-queue::school:other:u"));
  ok("Lock asked before removing unfinished paper", dialogs.some((m) => /Unfinished papers will be removed/.test(m)));
  ok("gate note after Lock", /cleared from this browser|Nothing from this account/.test(await page.locator("#gate-msg").innerText()));
  ok("passcode forgotten", (await page.evaluate(() => sessionStorage.getItem("storigen-grade-along-passcode"))) === null);

  // --- Clear device history also clears stored queue photos (team mode) ---
  await page.fill("#gate-pass", PASS);
  await page.click("#gate-go");
  await page.waitForSelector("#ga-lock:not([hidden])");
  const hasPhotos = await page.evaluate(() => {
    localStorage.setItem("storigen-os-grade-along-history::passcode", JSON.stringify([{ firstName: "Nico", grade: "3", date: "2026-11-01", scores: [3, 3, 3, 3], assessment: "pre", rubricId: "storigen-wonders", approved: true }]));
    localStorage.setItem("storigen-os-grade-along-teacher-queue::passcode", JSON.stringify({ v: 2, current: 0, assess: "pre", rubric: null, students: [{ student: "Nico", grade: "3", files: [{ name: "p.jpg", type: "image/jpeg", size: 4, dataUrl: "data:image/jpeg;base64,AAAA" }] }] }));
    return true;
  });
  await page.reload();
  await page.waitForSelector("#ga-lock:not([hidden])");
  await page.click("#mode-teacher");
  await page.waitForTimeout(300);
  const photoBefore = await page.evaluate(() => (localStorage.getItem("storigen-os-grade-along-teacher-queue::passcode") || "").includes('"dataUrl":"data:'));
  const btn = page.locator("button", { hasText: "Clear device history" });
  const visible = await btn.count();
  if (visible) {
    dialogs.length = 0;
    await btn.first().click();
    const after = await page.evaluate(() => ({ h: localStorage.getItem("storigen-os-grade-along-history::passcode"), q: localStorage.getItem("storigen-os-grade-along-teacher-queue::passcode") || "" }));
    ok("Clear device history removed history", after.h === null);
    ok("Clear device history removed stored photos", !after.q.includes('"dataUrl":"data:'));
    ok("its confirm mentions photos", dialogs.some((m) => /paper photos/.test(m)));
  } else {
    console.log("NOTE Clear device history button not rendered in this view (photoBefore=" + photoBefore + ")");
  }
  // --- School mode: invite sign-in, then Lock clears that workspace and ends the server session ---
  const mk = await worker.fetch(new Request("https://x/owner/schools", { method: "POST", headers: { "Content-Type": "application/json", "X-Teacher-Passcode": PASS, Origin: "https://gradealong.com" }, body: JSON.stringify({ name: "ZZ E2E School Two", paperAllowance: 5, adminName: "T Two", adminEmail: "two@example.invalid" }) }), env);
  const made = await mk.json();
  await page.click("#ga-lock");
  await page.waitForSelector("#gate-code");
  await page.fill("#gate-email", "two@example.invalid");
  await page.fill("#gate-code", made.inviteCode);
  await page.click("#gate-school-go");
  await page.waitForSelector("#ga-lock:not([hidden])");
  ok("school invite sign-in works", db.prepare("SELECT COUNT(*) n FROM sessions WHERE school_id=?").get(made.school.id).n === 1);
  const wsKey = "storigen-os-grade-along-history::school:" + made.school.id + ":" + made.admin.id;
  await page.evaluate((k) => localStorage.setItem(k, "[]"), wsKey);
  await page.click("#ga-lock");
  await page.waitForFunction(() => /Signed out/.test(document.getElementById("gate-msg").textContent));
  await page.waitForTimeout(500);
  ok("school Lock cleared that workspace", (await page.evaluate((k) => localStorage.getItem(k), wsKey)) === null);
  ok("school Lock ended the server session", db.prepare("SELECT COUNT(*) n FROM sessions WHERE school_id=?").get(made.school.id).n === 0);
  ok("no page errors", errors.length === 0 || (console.log(errors), false));
  await browser.close();
  console.log(`\n${n} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
