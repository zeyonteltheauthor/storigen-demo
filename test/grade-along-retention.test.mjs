import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const W = process.env.WORKER || new URL("../worker/src/app.js", import.meta.url).href;
// Workers runtime has crypto.subtle.timingSafeEqual; Node does not.
if (!crypto.subtle.timingSafeEqual) crypto.subtle.timingSafeEqual = (a, b) => { const x = new Uint8Array(a), y = new Uint8Array(b); if (x.length !== y.length) return false; let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i]; return d === 0; };
const mod = await import(W);
const worker = mod.default;

// Fake D1 over node:sqlite.
function makeD1(db) {
  const wrap = (sql, params = []) => ({
    bind: (...p) => wrap(sql, p),
    async first() { return db.prepare(sql).get(...params) ?? null; },
    async all() { return { results: db.prepare(sql).all(...params), success: true }; },
    async run() {
      const st = db.prepare(sql);
      if (/^\s*(select|pragma)/i.test(sql) || /returning/i.test(sql)) return { results: st.all(...params), meta: { changes: 0 } };
      const r = st.run(...params); return { meta: { changes: Number(r.changes) } };
    },
    _exec() { return this.run(); }
  });
  return {
    prepare: (sql) => wrap(sql),
    async exec(sql) {
      // Mimic D1: split on newlines -> multi-line statements would fail.
      db.exec(sql); return {};
    },
    async batch(stmts) {
      db.exec("BEGIN");
      try { const out = []; for (const s of stmts) out.push(await s.run()); db.exec("COMMIT"); return out; }
      catch (e) { db.exec("ROLLBACK"); throw e; }
    }
  };
}

const PASS = "test-pass-" + Math.random().toString(36).slice(2);
const db = new DatabaseSync(":memory:");
// Start from the v22 (pre-v23) schema to prove the migration is additive.
const v22 = readFileSync(process.env.V22_SCHEMA || new URL("./fixtures/schema-v22.sql", import.meta.url), "utf8");
db.exec(v22);
const env = { DB: makeD1(db), TEACHER_PASSCODE: PASS, SESSION_SECRET: "s".repeat(32) };
const ORIGIN = "https://gradealong.com";
let pass = 0;
const ok = (name, cond) => { assert.ok(cond, name); pass++; console.log("PASS", name); };

async function call(path, { method = "GET", body, headers = {} } = {}) {
  const req = new Request("https://api.test" + path, {
    method, headers: { Origin: ORIGIN, "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const res = await worker.fetch(req, env);
  return { status: res.status, data: await res.json() };
}
const owner = { "X-Teacher-Passcode": PASS };
const now = () => new Date().toISOString();
const ins = (sql, ...p) => db.prepare(sql).run(...p);

// Seed: a "keep" school (stands in for real schools) and a throwaway school.
ins("INSERT INTO schools (id,name,paper_allowance,papers_used,license_year,status,teachers_own_rubrics,created_at) VALUES ('keep','Keep Academy',100,3,2026,'active',0,?)", now());
ins("INSERT INTO teachers (id,school_id,email,name,role,active,created_at) VALUES ('tk','keep','k@x.test','K','admin',1,?)", now());
ins("INSERT INTO scores (id,school_id,teacher_id,first_name,grade,facilitator,date,assessment,rubric_id,rubric_name,scores_json,total,out_of,created_at,updated_at) VALUES ('sk','keep','tk','Zed','3','','2026-11-01','pre','','', '[3,3,3,3]',12,20,?,?)", now(), now());

const created = await call("/owner/schools", { method: "POST", headers: owner, body: { name: "ZZ Test School v23", paperAllowance: 10, adminName: "Test Admin", adminEmail: "test-admin@example.invalid" } });
ok("owner creates throwaway school", created.status === 200 && created.data.school && created.data.school.id);
const sid = created.data.school.id;
const tid = created.data.admin.id;
const cols = db.prepare("PRAGMA table_info(schools)").all().map((c) => c.name);
ok("migration added closed_at + delete_after", cols.includes("closed_at") && cols.includes("delete_after"));
ok("existing rows untouched by migration", db.prepare("SELECT COUNT(*) n FROM scores WHERE school_id='keep'").get().n === 1);

// Fake data for the throwaway school (fictional names only).
for (let i = 0; i < 3; i++) ins("INSERT INTO scores (id,school_id,teacher_id,first_name,grade,facilitator,date,assessment,rubric_id,rubric_name,scores_json,total,out_of,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", "s"+i, sid, tid, ["Maya","Nico","Ivy Mae Brown"][i], "3", ["Ms. T","Ms. T","=Evil"][i], "2026-11-0"+(i+1), "pre", "", "Wonders", "[4,3,3,2]", 12, 20, now(), now());
ins("INSERT INTO scores (id,school_id,teacher_id,first_name,grade,facilitator,date,assessment,rubric_id,rubric_name,scores_json,total,out_of,created_at,updated_at) VALUES ('st',?,?,'Maya','3','','2026-11-05','test','k1','Science',?,1,2,?,?)", sid, tid, JSON.stringify({kind:"test",items:[{n:1,correct:true},{n:2,correct:false,flagged:true}]}), now(), now());
ins("INSERT INTO rubrics (id,school_id,name,min,max,rows_json,updated_at,created_at) VALUES ('r1',?,'R',1,5,'[]',?,?)", sid, now(), now());
ins("INSERT INTO answer_keys (id,school_id,name,key_json,updated_at,created_at) VALUES ('k1',?,'K','{}',?,?)", sid, now(), now());
ins("INSERT INTO usage_events (id,school_id,teacher_id,kind,papers,created_at) VALUES ('u1',?,?,'grade',1,?)", sid, tid, now());
ins("INSERT INTO sessions (id,teacher_id,school_id,token_hash,expires_at,created_at) VALUES ('se1',?,?,'h1',?,?)", tid, sid, new Date(Date.now()+86400e3).toISOString(), now());

// Non-owner is refused.
const deniedClose = await call("/owner/schools/close", { method: "POST", body: { schoolId: sid } });
ok("close without passcode refused", deniedClose.status === 401);
const deniedDel = await call("/owner/schools/delete", { method: "POST", headers: { "X-Teacher-Passcode": "wrong" }, body: { schoolId: sid, confirmName: "ZZ Test School v23" } });
ok("delete with wrong passcode refused", deniedDel.status === 401);
const notClosed = await call("/owner/schools/delete", { method: "POST", headers: owner, body: { schoolId: sid, confirmName: "ZZ Test School v23" } });
ok("delete before close refused (409)", notClosed.status === 409);

// Close.
const closed = await call("/owner/schools/close", { method: "POST", headers: owner, body: { schoolId: sid } });
const days = (Date.parse(closed.data.school.deleteAfter) - Date.parse(closed.data.school.closedAt)) / 86400e3;
ok("close sets status closed + deletion date 30 days out", closed.data.school.status === "closed" && Math.round(days) === 30);
ok("close signs everyone out (sessions removed)", db.prepare("SELECT COUNT(*) n FROM sessions WHERE school_id=?").get(sid).n === 0);
const capOnClosed = await call("/owner/schools", { method: "POST", headers: owner, body: { schoolId: sid, status: "active" } });
ok("cannot reactivate closed school via cap/status path", capOnClosed.status === 409);
const list = await call("/owner/schools", { headers: owner });
ok("owner list shows closed school with deleteAfter", list.data.schools.some((s) => s.id === sid && s.status === "closed" && s.deleteAfter));

// Export.
const exp = await call("/owner/schools/export?schoolId=" + encodeURIComponent(sid), { headers: owner });
ok("export returns CSV with header + 4 rows", exp.status === 200 && exp.data.rows === 4 && exp.data.csv.split("\r\n").filter(Boolean).length === 5);
ok("export neutralises spreadsheet formulas", exp.data.csv.includes(`"'=Evil"`));
ok("v24: export shows first name only (legacy full-name row)", exp.data.csv.includes("Ivy") && !/Mae|Brown/.test(exp.data.csv));
ok("v24: export has a Last initial column", exp.data.csv.split("\r\n")[0].includes("Last initial"));
ok("export includes test item summary", /Q1:correct \| Q2:wrong\(flagged\)/.test(exp.data.csv));
ok("export filename", /^grade-along-zz-test-school-v23-scores-\d{4}-\d\d-\d\d\.csv$/.test(exp.data.filename));
const expDenied = await call("/owner/schools/export?schoolId=" + sid);
ok("export without passcode refused", expDenied.status === 401);

// Reopen then close again.
const re = await call("/owner/schools/reopen", { method: "POST", headers: owner, body: { schoolId: sid } });
ok("reopen clears dates and leaves school paused", re.data.school.status === "paused" && !re.data.school.deleteAfter);
await call("/owner/schools/close", { method: "POST", headers: owner, body: { schoolId: sid } });

// Typed confirmation.
const badName = await call("/owner/schools/delete", { method: "POST", headers: owner, body: { schoolId: sid, confirmName: "ZZ Test" } });
ok("delete with wrong typed name refused", badName.status === 400);
ok("nothing deleted after refused delete", db.prepare("SELECT COUNT(*) n FROM scores WHERE school_id=?").get(sid).n === 4);
const del = await call("/owner/schools/delete", { method: "POST", headers: owner, body: { schoolId: sid, confirmName: "  zz test school v23 " } });
ok("delete now succeeds with typed name", del.status === 200 && del.data.deletion.method === "owner_now");
const c = del.data.deletion.counts;
ok("deletion record counts", c.scores === 4 && c.teachers === 1 && c.rubrics === 1 && c.answer_keys === 1 && c.usage_events === 1 && c.invites >= 0);
for (const t of ["scores","usage_events","rubrics","answer_keys","sessions","invites","teachers"]) {
  ok("no " + t + " left for deleted school", db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE school_id=?`).get(sid).n === 0);
}
ok("school row removed", !db.prepare("SELECT 1 FROM schools WHERE id=?").get(sid));
const rec = db.prepare("SELECT * FROM school_deletions WHERE school_id=?").all(sid);
ok("one minimal deletion record kept", rec.length === 1 && rec[0].school_name === "ZZ Test School v23" && !/Maya|Nico/.test(JSON.stringify(rec)));
const dl = await call("/owner/deletions", { headers: owner });
ok("owner can list deletion records", dl.data.deletions.some((d) => d.schoolId === sid));
ok("other school untouched", db.prepare("SELECT COUNT(*) n FROM scores WHERE school_id='keep'").get().n === 1 && db.prepare("SELECT status FROM schools WHERE id='keep'").get().status === "active");

// Scheduled cleanup.
ins("INSERT INTO schools (id,name,paper_allowance,papers_used,license_year,status,teachers_own_rubrics,created_at,closed_at,delete_after) VALUES ('due','Due School',1,0,2026,'closed',0,?,?,?)", now(), now(), new Date(Date.now()-1000).toISOString());
ins("INSERT INTO scores (id,school_id,teacher_id,first_name,grade,facilitator,date,assessment,rubric_id,rubric_name,scores_json,total,out_of,created_at,updated_at) VALUES ('sd','due','x','Lia','2','','d','pre','','','[1]',1,5,?,?)", now(), now());
ins("INSERT INTO schools (id,name,paper_allowance,papers_used,license_year,status,teachers_own_rubrics,created_at,closed_at,delete_after) VALUES ('later','Later School',1,0,2026,'closed',0,?,?,?)", now(), now(), new Date(Date.now()+86400e3).toISOString());
ins("INSERT INTO sessions (id,teacher_id,school_id,token_hash,expires_at,created_at) VALUES ('old','tk','keep','h2',?,?)", new Date(Date.now()-1000).toISOString(), now());
ins("INSERT INTO sessions (id,teacher_id,school_id,token_hash,expires_at,created_at) VALUES ('live','tk','keep','h3',?,?)", new Date(Date.now()+86400e3).toISOString(), now());
ins("INSERT INTO invites (id,school_id,teacher_id,code_hash,expires_at,used_at,created_at) VALUES ('iold','keep','tk','c1',?,NULL,?)", new Date(Date.now()-1000).toISOString(), now());
ins("INSERT INTO invites (id,school_id,teacher_id,code_hash,expires_at,used_at,created_at) VALUES ('ilive','keep','tk','c2',?,NULL,?)", new Date(Date.now()+86400e3).toISOString(), now());
ins("INSERT INTO invites (id,school_id,teacher_id,code_hash,expires_at,used_at,created_at) VALUES ('iused','keep','tk','c3',?,?,?)", new Date(Date.now()-1000).toISOString(), now(), now());
const r = await mod.runRetention(env);
ok("cron deletes due school only", r.schools === 1 && !db.prepare("SELECT 1 FROM schools WHERE id='due'").get() && db.prepare("SELECT 1 FROM schools WHERE id='later'").get());
ok("cron removed due school's scores", db.prepare("SELECT COUNT(*) n FROM scores WHERE school_id='due'").get().n === 0);
ok("cron recorded scheduled deletion", db.prepare("SELECT method FROM school_deletions WHERE school_id='due'").get().method === "scheduled");
ok("cron removed expired session + invite only", !db.prepare("SELECT 1 FROM sessions WHERE id='old'").get() && db.prepare("SELECT 1 FROM sessions WHERE id='live'").get() && !db.prepare("SELECT 1 FROM invites WHERE id='iold'").get() && db.prepare("SELECT 1 FROM invites WHERE id='ilive'").get());
ok("cron keeps redeemed invites even when expired", !!db.prepare("SELECT 1 FROM invites WHERE id='iused'").get());
ok("keep school still intact after cron", db.prepare("SELECT COUNT(*) n FROM scores WHERE school_id='keep'").get().n === 1);
// scheduled() entry point
let waited = null;
await worker.scheduled({ cron: "0 8 * * *" }, env, { waitUntil: (p) => { waited = p; } });
await waited;
ok("scheduled() runs via waitUntil", waited instanceof Promise);
// Root still works.
const root = await call("/");
ok("root health unchanged", root.data.service === "grade-along-api");
console.log(`\n${pass} passed`);
