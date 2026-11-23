// v25: roster-key growth pairing + flag-a-bad-result credits, plus v24 checks.
// Fictional names only. Run: node test/grade-along-v25.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
if (!crypto.subtle.timingSafeEqual) crypto.subtle.timingSafeEqual = (a, b) => { const x = new Uint8Array(a), y = new Uint8Array(b); if (x.length !== y.length) return false; let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i]; return d === 0; };
const mod = await import(process.env.WORKER || new URL("../worker/src/app.js", import.meta.url).href);
const entry = await import(new URL("../worker/src/index.js", import.meta.url).href);
const worker = mod.default;
const { cleanFirstName, cleanInitial, scrubName, scoreKey, testReadUsable } = mod;

let pass = 0;
const ok = (name, cond) => { assert.ok(cond, name); pass++; console.log("PASS", name); };

// --- entry module exports only the handler (wrangler / workerd compatibility)
ok("entry index.js exports only default", Object.keys(entry).join(",") === "default" && entry.default === worker);

// --- name rules
const cases = [["Testy Mae Brown", "Testy"], ["Brown, Testy Mae", "Testy"], ["  testy   mae  ", "testy"], ["Mary-Kate O'Neil", "Mary-Kate"], ["Brown,", "Brown"], ["Testy B.", "Testy"], ["José Luis García", "José"], ["", ""], ["- Ivy", "Ivy"]];
for (const [inp, out] of cases) ok(`cleanFirstName(${JSON.stringify(inp)}) = ${out}`, cleanFirstName(inp) === out);
ok("cleanInitial accepts one letter", cleanInitial("b") === "B" && cleanInitial("R.") === "R" && cleanInitial("Brown") === "" && cleanInitial("") === "");
ok("scrubName drops middle+last", scrubName("Testy Mae Brown wrote a great ending.", "Testy") === "Testy wrote a great ending.");
ok("scrubName keeps sentence words", scrubName("Great job, Testy! The ending works. Testy The Brave is a fun title.", "Testy") === "Great job, Testy! The ending works. Testy The Brave is a fun title.");
ok("scrubName leaves other text", scrubName("Your story about Mars Rover is fun.", "Testy") === "Your story about Mars Rover is fun.");

// --- harness
function makeD1(db) {
  const wrap = (sql, params = []) => ({
    bind: (...p) => wrap(sql, p),
    async first() { return db.prepare(sql).get(...params) ?? null; },
    async all() { return { results: db.prepare(sql).all(...params), success: true }; },
    async run() { const st = db.prepare(sql); if (/^\s*(select|pragma)/i.test(sql) || /returning/i.test(sql)) return { results: st.all(...params), meta: { changes: 0 } }; const r = st.run(...params); return { meta: { changes: Number(r.changes) } }; }
  });
  return { prepare: (sql) => wrap(sql), async exec(sql) { db.exec(sql); return {}; }, async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; } };
}
const db = new DatabaseSync(":memory:");
db.exec(readFileSync(new URL("./fixtures/schema-v22.sql", import.meta.url), "utf8"));
const PASS = "v25-" + Math.random().toString(36).slice(2);
const env = { DB: makeD1(db), TEACHER_PASSCODE: PASS, SESSION_SECRET: "s".repeat(32), ANTHROPIC_API_KEY: "test-not-a-key" };

const realFetch = globalThis.fetch;
let ipN = 0;
let mode = "ok", lastSystem = "", lastPrompt = "", calls = 0;
const fullNameDraft = {
  lenses: { score: 3, comment: "Testy Mae Brown uses vivid details." }, organization: { score: 3, comment: "Clear order." },
  development: { score: 3, comment: "Good middle, Testy Brown." }, conventions: { score: 3, comment: "Capitals used." },
  overallFeedback: "Great work, Testy Mae Brown! The ending works.", transcriptionNote: "Name on paper read.",
  storySummary: "Testy Mae Brown wrote about a dog.", studentFacingFeedback: "Testy Brown, keep going!", paperLanguage: "en"
};
globalThis.fetch = async (url, init) => {
  if (!String(url).startsWith("https://api.anthropic.com")) return realFetch(url, init);
  calls++;
  const req = JSON.parse(init.body);
  const sys = req.system || "";
  const isCover = /cover sheet/i.test(sys.slice(0, 120));
  if (!isCover) { lastSystem = sys; lastPrompt = JSON.stringify(req.messages); }
  let out;
  if (isCover) out = { firstName: "Brown, Testy Mae", grade: "3rd", facilitator: "Ms. T", date: "2026-11-20" };
  else if (mode === "ok") out = fullNameDraft;
  else if (mode === "blanktest") out = { answers: [{ n: 1, read: "", confidence: 0.9, mark: "blank" }, { n: 2, read: "?", confidence: 0.3, mark: "unclear" }], transcriptionNote: "" };
  else if (mode === "cleartest") out = { answers: [{ n: 1, read: "A", confidence: 0.95, mark: "clear" }, { n: 2, read: "", confidence: 0.9, mark: "blank" }], transcriptionNote: "" };
  else if (mode === "500") return new Response("{}", { status: 500 });
  return new Response(JSON.stringify({ model: "m", content: [{ type: "text", text: JSON.stringify(out) }], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 });
};
async function call(path, body, headers = {}, method = "POST") {
  const res = await worker.fetch(new Request("https://api.test" + path, { method, headers: { Origin: "https://gradealong.com", "Content-Type": "application/json", "CF-Connecting-IP": "10.0." + (++ipN % 250) + "." + (ipN % 7), ...headers }, body: body ? JSON.stringify(body) : undefined }), env);
  return { status: res.status, data: await res.json() };
}
const mk = await call("/owner/schools", { name: "ZZ v25 test", paperAllowance: 3, adminName: "Admin", adminEmail: "a@example.invalid" }, { "X-Teacher-Passcode": PASS });
ok("throwaway school created", mk.status === 200);
const sid = mk.data.school.id;
const red = await call("/auth/redeem", { email: "a@example.invalid", code: mk.data.inviteCode });
ok("admin signs in", red.status === 200 && red.data.token);
const T = { "X-Teacher-Session": red.data.token };
const used = () => db.prepare("SELECT papers_used u FROM schools WHERE id=?").get(sid).u;
const img = (c) => "data:image/jpeg;base64," + c.repeat(400);

// --- /grade: full name in, first name only to the AI and out of the AI
mode = "ok";
const g1 = await call("/grade", { firstName: "Testy Mae Brown", grade: "3", images: [img("A")] }, T);
ok("grade ok", g1.status === 200 && g1.data.rows);
ok("prompt to AI carries first name only", lastPrompt.includes("Student first name: Testy\\n") && !/Mae|Brown/.test(lastPrompt));
ok("system prompt tells AI first name only", /Never write the student's middle name, last name, or initials/.test(lastSystem));
const allText = JSON.stringify(g1.data);
ok("AI output scrubbed of middle/last name", !/Mae|Brown/.test(allText) && /Testy uses vivid details/.test(allText) && /Great work, Testy!/.test(allText));
ok("first paper charged once", used() === 1);

// --- billing (b): regrade/retry of the same paper within 24h is free; another paper is charged
await call("/grade", { firstName: "Testy", grade: "3", images: [img("A")] }, T);
ok("regrade same paper within 24h: free", used() === 1);
await call("/grade", { firstName: "Nico", grade: "3", images: [img("B")] }, T);
ok("different paper: charged", used() === 2);
ok("usage_events has paper_key", db.prepare("SELECT COUNT(*) n FROM usage_events WHERE school_id=? AND paper_key IS NOT NULL AND length(paper_key)=40").get(sid).n === 2);
db.prepare("UPDATE usage_events SET created_at=? WHERE school_id=?").run(new Date(Date.now() - 25 * 3600e3).toISOString(), sid);
await call("/grade", { firstName: "Testy", grade: "3", images: [img("A")] }, T);
ok("same paper after 24h: charged again", used() === 3);
const stopped = await call("/grade", { firstName: "Ivy", grade: "3", images: [img("C")] }, T);
ok("allowance used up: new paper refused", stopped.status === 403 && used() === 3);
const freeRetry = await call("/grade", { firstName: "Testy", grade: "3", images: [img("A")] }, T);
ok("allowance used up: retry of a paper charged today still works free", freeRetry.status === 200 && used() === 3);
db.prepare("UPDATE schools SET paper_allowance=50 WHERE id=?").run(sid);

// --- cover read returns first name only (handles "Last, First Middle")
const cov = await call("/grade", { coverImage: img("D") }, T);
ok("cover read: 'Brown, Testy Mae' -> Testy", cov.status === 200 && cov.data.cover.firstName === "Testy");

// --- billing (a): test read with nothing clearly marked is not charged
const shape = { name: "Quiz", questions: [{ n: 1, type: "mc", choices: "AB", answer: "A" }, { n: 2, type: "mc", choices: "AB", answer: "B" }] };
mode = "blanktest";
let before = used();
const tb = await call("/test/read", { firstName: "Testy Mae Brown", key: shape, images: [img("E")] }, T);
ok("test read all blank/unclear: 422 noAnswers, no credit", tb.status === 422 && tb.data.noAnswers === true && used() === before && /No paper credit was used/.test(tb.data.error));
mode = "cleartest";
const tc = await call("/test/read", { firstName: "Testy", key: shape, images: [img("E")] }, T);
ok("test read with a clear answer: charged", tc.status === 200 && used() === before + 1);
await call("/test/read", { firstName: "Testy", key: shape, images: [img("E")] }, T);
ok("test reread same paper: free", used() === before + 1);
ok("testReadUsable: clear with no text is not usable", !testReadUsable({ answers: [{ mark: "clear", read: "" }] }) && testReadUsable({ answers: [{ mark: "multiple", read: "" }] }));

// --- approved-only saving
const base = { grade: "3", facilitator: "Ms. T", date: "2026-11-20", assessment: "pre", rubricId: "storigen-wonders", rubricName: "Wonders", scores: [3, 3, 3, 3], total: 12, outOf: 20 };
const na = await call("/school/scores", { ...base, firstName: "Testy" }, T);
ok("unapproved score refused", na.status === 400 && na.data.notApproved === true);
ok("nothing stored for unapproved", db.prepare("SELECT COUNT(*) n FROM scores WHERE school_id=?").get(sid).n === 0);

// --- full name sent -> first name stored; teacher initial kept; same-name students kept apart
const s1 = await call("/school/scores", { ...base, firstName: "Testy Mae Brown", lastInitial: "B", rosterId: "r1", approved: true }, T);
const s2 = await call("/school/scores", { ...base, firstName: "Testy", lastInitial: "R", rosterId: "r2", scores: [2, 2, 2, 2], total: 8, approved: true }, T);
ok("both saves ok", s1.status === 200 && s2.status === 200 && s1.data.id !== s2.data.id);
const names = db.prepare("SELECT first_name, last_initial, approved FROM scores WHERE school_id=? ORDER BY last_initial").all(sid);
ok("stored first names only", names.every((r) => r.first_name === "Testy"));
ok("teacher initials stored, approved=1", names.map((r) => r.last_initial).join() === "B,R" && names.every((r) => r.approved === 1));
const s3 = await call("/school/scores", { ...base, firstName: "Testy", rosterId: "r3", approved: true, scores: [4, 4, 4, 4], total: 16 }, T);
const s4 = await call("/school/scores", { ...base, firstName: "Testy", rosterId: "r4", approved: true, scores: [1, 1, 1, 1], total: 4 }, T);
ok("same name, no initial, different roster keys: two rows (no overwrite)", s3.data.id !== s4.data.id && db.prepare("SELECT COUNT(*) n FROM scores WHERE school_id=? AND last_initial=''").get(sid).n === 2);
const s3b = await call("/school/scores", { ...base, firstName: "Testy", rosterId: "r3", approved: true, scores: [5, 4, 4, 4], total: 17 }, T);
ok("re-save same roster key updates in place", s3b.data.updated === true && s3b.data.id === s3.data.id);
ok("server never invents an initial from the paper", db.prepare("SELECT COUNT(*) n FROM scores WHERE school_id=? AND roster_id IN ('r3','r4') AND last_initial<>''").get(sid).n === 0);

// --- report: posts pair by name + initial; ambiguous names do not pair
await call("/school/scores", { ...base, assessment: "post", firstName: "Testy", lastInitial: "B", rosterId: "r1", scores: [4, 4, 4, 4], total: 16, approved: true }, T);
await call("/school/scores", { ...base, assessment: "post", firstName: "Testy", rosterId: "r6", scores: [2, 2, 2, 2], total: 8, approved: true }, T);
await call("/school/scores", { ...base, assessment: "post", firstName: "Nico", rosterId: "r7", scores: [2, 2, 2, 2], total: 8, approved: true }, T);
const rep = await call("/school/report", null, T, "GET");
if (rep.status !== 200) console.log("report", rep.status, JSON.stringify(rep.data).slice(0, 300));
ok("report ok", rep.status === 200);
const studs = JSON.stringify(rep.data);
const all = [];
JSON.parse(studs, (k, v) => { if (v && typeof v === "object" && "firstName" in v && "pre" in v) all.push(v); return v; });
const tb2 = all.find((s) => s.firstName === "Testy" && s.lastInitial === "B");
ok("Testy B. pre 12 pairs with Testy B. post 16", tb2 && tb2.pre === 12 && tb2.post === 16 && tb2.change === 4);
const amb = all.filter((s) => s.firstName === "Testy" && !s.lastInitial);
ok("two 'Testy' (no initial) with different roster keys stay separate (not merged, not sameName)", amb.filter((s) => s.pre != null).length >= 2 && amb.every((s) => !s.sameName) && !amb.some((s) => s.pre != null && s.post != null));
const nico = all.find((s) => s.firstName === "Nico");
ok("v23 bug fixed: Nico's post is not paired with another student's pre", nico && nico.pre == null && nico.unmatchedPost);
ok("report has no full names", !/Mae|Brown/.test(studs));

// --- legacy row with full name is shown first-name-only
db.prepare("INSERT INTO scores (id,school_id,teacher_id,first_name,grade,facilitator,date,assessment,rubric_id,rubric_name,scores_json,total,out_of,created_at,updated_at) VALUES ('legacy',?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(sid, red.data.teacher ? red.data.teacher.id : mk.data.admin.id, "Brown, Ivy Mae", "4", "", "2026-11-01", "pre", "", "", "[3,3,3,3]", 12, 20, new Date().toISOString(), new Date().toISOString());
const rep2 = await call("/school/report", null, T, "GET");
ok("legacy full-name row shows as first name only in report", !/Mae|Brown/.test(JSON.stringify(rep2.data)) && JSON.stringify(rep2.data).includes('"Ivy"'));
ok("scoreKey uses roster key when present", scoreKey({ firstName: "Testy Mae", lastInitial: "B", grade: "3", rosterId: "r1" }) === "rid:r1");
ok("scoreKey falls back to name+initial+grade for legacy rows", scoreKey({ firstName: "Testy Mae", lastInitial: "B", grade: "3" }) === "name:testy|b|3");
ok("different roster keys never share a pairing key", scoreKey({ firstName: "Sam", rosterId: "a", grade: "3" }) !== scoreKey({ firstName: "Sam", rosterId: "b", grade: "3" }));

// --- v25: two Sams with the same first name pair by roster ID
const samBase = { ...base, grade: "4", facilitator: "Ms. ZZ", date: "2026-11-01", lastInitial: "", approved: true };
await call("/school/scores", { ...samBase, firstName: "Sam", rosterId: "zzsama01", scores: [2, 2, 3, 3], total: 10, approved: true }, T);
await call("/school/scores", { ...samBase, firstName: "Sam", rosterId: "zzsamb02", scores: [2, 2, 2, 2], total: 8, approved: true }, T);
await call("/school/scores", { ...samBase, assessment: "post", date: "2026-11-20", firstName: "Sam", rosterId: "zzsama01", scores: [4, 4, 4, 4], total: 16, approved: true }, T);
await call("/school/scores", { ...samBase, assessment: "post", date: "2026-11-20", firstName: "Sam", rosterId: "zzsamb02", scores: [3, 3, 3, 3], total: 12, approved: true }, T);
const samRep = await call("/school/report", null, T, "GET");
ok("same-name report ok", samRep.status === 200);
const samAll = [];
for (const g of (samRep.data.byGrade || [])) for (const s of (g.students || [])) if (s.grade === "4") samAll.push(s);
const samPairs = samAll.filter((s) => s.firstName === "Sam" && s.pre != null && s.post != null);
ok("two Sams pair by roster ID: 10→16 and 8→12, never merged", samPairs.length === 2 && samPairs.some((s) => s.pre === 10 && s.post === 16 && s.change === 6) && samPairs.some((s) => s.pre === 8 && s.post === 12 && s.change === 4) && !samPairs.some((s) => (s.pre === 10 && s.post === 12) || (s.pre === 8 && s.post === 16)) && samPairs.every((s) => !s.sameName));

// Legacy rows (no roster id): unique name pairs; two of the same name stay unpaired
await call("/school/scores", { ...base, grade: "5", firstName: "Bea", rosterId: "", date: "2026-11-01", scores: [2, 2, 2, 2], total: 8, approved: true }, T);
await call("/school/scores", { ...base, grade: "5", firstName: "Bea", rosterId: "", date: "2026-11-20", assessment: "post", scores: [4, 4, 3, 3], total: 14, approved: true }, T);
await call("/school/scores", { ...base, grade: "5", firstName: "Lia", rosterId: "", date: "2026-11-01", scores: [1, 1, 1, 1], total: 4, approved: true }, T);
await call("/school/scores", { ...base, grade: "5", firstName: "Lia", rosterId: "", date: "2026-11-02", scores: [3, 3, 3, 3], total: 12, approved: true }, T);
const legRep = await call("/school/report", null, T, "GET");
const grade5 = [];
for (const g of (legRep.data.byGrade || [])) for (const s of (g.students || [])) if (s.grade === "5") grade5.push(s);
const bea = grade5.find((s) => s.firstName === "Bea");
ok("legacy unique name pairs by first name + grade", bea && bea.pre === 8 && bea.post === 14 && bea.change === 6 && !bea.sameName);
const lias = grade5.filter((s) => s.firstName === "Lia");
ok("legacy same-name rows are sameName and not paired", lias.length >= 2 && lias.every((s) => s.sameName) && lias.every((s) => s.post == null));
// A rostered Sam must not merge with a legacy Sam in the same grade
await call("/school/scores", { ...base, grade: "4", firstName: "Sam", rosterId: "", date: "2026-10-01", scores: [1, 1, 1, 1], total: 4, approved: true }, T);
await call("/school/scores", { ...base, grade: "4", firstName: "Sam", rosterId: "", date: "2026-10-20", assessment: "post", scores: [5, 5, 5, 5], total: 20, approved: true }, T);
const mixRep = await call("/school/report", null, T, "GET");
const grade4 = [];
for (const g of (mixRep.data.byGrade || [])) for (const s of (g.students || [])) if (s.grade === "4") grade4.push(s);
ok("rostered Sams still pair 10→16 and 8→12 after a legacy Sam is added", grade4.some((s) => s.pre === 10 && s.post === 16) && grade4.some((s) => s.pre === 8 && s.post === 12) && !grade4.some((s) => s.pre === 10 && s.post === 20));
const legacySam = grade4.filter((s) => s.pre === 4 || s.post === 20);
ok("legacy Sam does not merge with rostered Sams", legacySam.every((s) => s.pre !== 10 && s.pre !== 8) && (legacySam.some((s) => s.pre === 4 && s.post === 20) || (legacySam.some((s) => s.pre === 4) && legacySam.some((s) => s.post === 20))));

// --- v25: Flag bad result restores a credit, once, with a monthly cap
db.prepare("UPDATE schools SET paper_allowance=80, papers_used=0 WHERE id=?").run(sid);
db.prepare("DELETE FROM usage_events WHERE school_id=?").run(sid);
db.prepare("DELETE FROM credit_flags WHERE school_id=?").run(sid);
mode = "ok";
const flagIds = [];
for (let i = 0; i < 6; i++) {
  const g = await call("/grade", { firstName: "Nico", grade: "3", images: [img("F" + i)] }, T);
  ok("flag setup paper " + (i + 1) + " charged", g.status === 200 && g.data.usageId);
  flagIds.push(g.data.usageId);
}
ok("six papers charged after reset", used() === 6);
const f1 = await call("/school/usage/flag", { usageId: flagIds[0], reason: "wrong_student" }, T);
ok("first flag restores a credit", f1.status === 200 && f1.data.restored === true && used() === 5 && f1.data.flagsUsed === 1 && f1.data.flagsCap === 5);
const f1b = await call("/school/usage/flag", { usageId: flagIds[0], reason: "garbled_text" }, T);
ok("double-flag refused", f1b.status === 409 && f1b.data.already === true && used() === 5);
// 2..5 restore; 6th is recorded but not restored
for (let i = 1; i < 5; i++) {
  const f = await call("/school/usage/flag", { usageId: flagIds[i], reason: "misread_page" }, T);
  ok("flag " + (i + 1) + " restores", f.status === 200 && f.data.restored === true);
}
ok("five restores used, one charge left of the six", used() === 1);
const f6 = await call("/school/usage/flag", { usageId: flagIds[5], reason: "other", note: "unreadable" }, T);
ok("sixth flag is recorded but denied (over cap)", f6.status === 200 && f6.data.restored === false && f6.data.overCap === true && used() === 1 && /5 credits restored this month/.test(f6.data.message || ""));
const flagRows = db.prepare("SELECT usage_id, restored, reason FROM credit_flags WHERE school_id=? ORDER BY created_at").all(sid);
ok("six flag rows stored; fifth restored, sixth not", flagRows.length === 6 && flagRows.filter((r) => r.restored === 1).length === 5 && flagRows[5].restored === 0 && flagRows[5].reason === "other");

// Another teacher's usage row cannot be flagged (or restored)
const added = await call("/school/teachers", { email: "b@example.invalid", name: "Other Teacher", role: "teacher" }, T);
ok("second teacher invited", added.status === 200 && added.data.inviteCode);
const redB = await call("/auth/redeem", { email: "b@example.invalid", code: added.data.inviteCode });
ok("second teacher signs in", redB.status === 200 && redB.data.token);
const TB = { "X-Teacher-Session": redB.data.token };
const beforeOther = used();
const otherFlag = await call("/school/usage/flag", { usageId: flagIds[5], reason: "wrong_student" }, TB);
ok("another teacher cannot flag this row", (otherFlag.status === 404 || otherFlag.status === 403) && used() === beforeOther);
db.prepare("UPDATE schools SET teachers_own_rubrics=1 WHERE id=?").run(sid);
const gB = await call("/grade", { firstName: "Nico", grade: "3", images: [img("Z")] }, TB);
ok("second teacher can grade and flag their own charge", gB.status === 200 && gB.data.usageId);
const ownFlag = await call("/school/usage/flag", { usageId: gB.data.usageId, reason: "garbled_text" }, TB);
ok("second teacher restores their own first credit of the month", ownFlag.status === 200 && ownFlag.data.restored === true && ownFlag.data.flagsUsed === 1);

// --- cron clears paper keys older than 24h

const keysBefore = db.prepare("SELECT COUNT(*) n FROM usage_events WHERE paper_key IS NOT NULL").get().n;
db.prepare("UPDATE usage_events SET created_at=? WHERE school_id=?").run(new Date(Date.now() - 30 * 3600e3).toISOString(), sid);
const ret = await mod.runRetention(env);
ok("cron clears paper keys older than 24h", keysBefore > 0 && ret.paperKeys === keysBefore && db.prepare("SELECT COUNT(*) n FROM usage_events WHERE paper_key IS NOT NULL").get().n === 0);

console.log(`\n${pass} passed`);
globalThis.fetch = realFetch;
