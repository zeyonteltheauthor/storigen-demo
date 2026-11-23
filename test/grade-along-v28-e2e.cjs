// v28 browser checks: per-network cap wording and fictional-samples warning; plus v27: sample photos are not persisted; plus v26 sample photo path, clear-on-switch, remove/clear, self-heal; plus v25 roster-key growth pairing, flag-a-bad-result, plus first-name-only everywhere, same-name warning + teacher initial,
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
  const made = await wcall("/owner/schools", { name: "ZZ v25 E2E", paperAllowance: 10, adminName: "Admin", adminEmail: "a@example.invalid" }, { "X-Teacher-Passcode": PASS });

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
  ok("v28 label", (await page.locator(".version-label").first().innerText()).includes("Grade Along v28"));
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

  // v25: two Sams with different roster keys pair pre/post correctly; name-only never merges them.
  const growth = await page.evaluate(() => {
    const T = window.__GA_TEST;
    const pool = [
      { firstName: "Sam", lastInitial: "", rosterId: "zzsama01", grade: "3", date: "2026-11-01", assessment: "pre", scores: [2,2,3,3], total: 10, rubricId: T.rubricId(), rubricName: "Storigen Wonders", source: "device", id: "a-pre" },
      { firstName: "Sam", lastInitial: "", rosterId: "zzsamb02", grade: "3", date: "2026-11-01", assessment: "pre", scores: [2,2,2,2], total: 8, rubricId: T.rubricId(), rubricName: "Storigen Wonders", source: "device", id: "b-pre" }
    ];
    const mk = (rid, scores) => { const st = T.blankStudent(); st.student = "Sam"; st.initial = ""; st.rid = rid; st.grade = "3"; st.assess = "post"; st.scores = scores; return st; };
    const a = mk("zzsama01", [4,4,4,4]), b = mk("zzsamb02", [3,3,3,3]);
    const ga = T.growthFor(a, pool), gb = T.growthFor(b, pool);
    const legacyPool = [
      { firstName: "Lia", lastInitial: "", rosterId: "", grade: "3", date: "2026-11-01", assessment: "pre", scores: [1,1,1,1], total: 4, rubricId: T.rubricId(), rubricName: "Storigen Wonders", source: "device", id: "l1" },
      { firstName: "Lia", lastInitial: "", rosterId: "", grade: "3", date: "2026-11-01", assessment: "pre", scores: [2,2,2,2], total: 8, rubricId: T.rubricId(), rubricName: "Storigen Wonders", source: "device", id: "l2" }
    ];
    const lia = T.blankStudent(); lia.student = "Lia"; lia.initial = ""; lia.rid = ""; lia.grade = "3"; lia.assess = "post"; lia.scores = [3,3,3,3];
    return {
      a: ga && { pre: ga.preTotal, post: ga.postTotal, change: ga.change },
      b: gb && { pre: gb.preTotal, post: gb.postTotal, change: gb.change },
      amb: T.preAmbiguous(lia, legacyPool),
      liaAuto: T.autoMatch(lia, legacyPool)
    };
  });
  ok("two Sams pair by roster ID on the device (10→16 and 8→12)", growth.a && growth.a.pre === 10 && growth.a.post === 16 && growth.a.change === 6 && growth.b && growth.b.pre === 8 && growth.b.post === 12 && growth.b.change === 4);
  ok("legacy same-name pre rows are ambiguous and not auto-matched", growth.amb === true && growth.liaAuto == null);

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

  // v26: sample photo paths, switch-clears-files, remove/clear, drop undecodable, self-heal.
  const bases = await page.evaluate(() => {
    const b = window.__GA_TEST.gradeAlongBase;
    return {
      demo: b("/demo"),
      demoSlash: b("/demo/"),
      root: b("/"),
      app: b("/grade-along/"),
      appBare: b("/grade-along"),
      appIndex: b("/grade-along/index.html"),
      pages: b("/storigen-demo/grade-along/"),
      pagesIndex: b("/storigen-demo/grade-along/index.html")
    };
  });
  ok("gradeAlongBase maps / and /demo to /grade-along/", bases.demo === "/grade-along/" && bases.demoSlash === "/grade-along/" && bases.root === "/grade-along/");
  ok("gradeAlongBase keeps /grade-along/ and GitHub Pages prefix", bases.app === "/grade-along/" && bases.appBare === "/grade-along/" && bases.appIndex === "/grade-along/" && bases.pages === "/storigen-demo/grade-along/" && bases.pagesIndex === "/storigen-demo/grade-along/");

  const sampleCheck = await page.evaluate(async () => {
    const T = window.__GA_TEST;
    const papers = T.demoPapers();
    const results = [];
    for (const s of papers) {
      if (!s.image) { results.push({ id: s.id, image: false, ok: true }); continue; }
      const src = T.sampleSrc(s.image);
      const res = await fetch(src);
      const buf = await res.arrayBuffer();
      const file = new File([buf], s.file || "sample.jpg", { type: "image/jpeg" });
      results.push({
        id: s.id,
        src,
        status: res.status,
        type: (res.headers.get("content-type") || "").split(";")[0],
        bytes: buf.byteLength,
        head: new Uint8Array(buf.slice(0, 3)).join(","),
        decodes: await T.imageLooksDecodable(file)
      });
    }
    return results;
  });
  const imageSamples = sampleCheck.filter((s) => s.src);
  ok("only Maya and Nico science samples have images, and both decode", imageSamples.length === 2 && imageSamples.every((s) => s.status === 200 && s.decodes && s.head === "255,216,255" && s.bytes > 1000) && sampleCheck.every((s) => s.ok !== false));

  await page.evaluate(async () => {
    const T = window.__GA_TEST;
    const st = T.state();
    st.student = "Maya";
    await T.loadDemoSample("test-maya");
  });
  const afterMaya = await page.evaluate(() => {
    const st = window.__GA_TEST.state();
    return { n: st.files.length, name: (st.files[0] && st.files[0].name) || "", student: st.student };
  });
  ok("Maya science sample attaches a decodable JPG", afterMaya.n === 1 && /maya-science-check\.jpg/i.test(afterMaya.name) && afterMaya.student === "Maya");
  ok("remove (×) control is visible", await page.locator(".attach-remove").count() === 1);
  ok("Clear photos control is visible", await page.locator("#t-clear-photos").isVisible());

  await page.evaluate(async () => { await window.__GA_TEST.loadDemoSample("pencil"); });
  const afterPencil = await page.evaluate(() => {
    const st = window.__GA_TEST.state();
    return { n: st.files.length, student: st.student, story: (st.story || "").slice(0, 20), toolsHidden: document.getElementById("t-attach-tools").hidden };
  });
  ok("switching to Jalen clears the science photo", afterPencil.n === 0 && afterPencil.student === "Jalen" && /Jalen/.test(afterPencil.story) && afterPencil.toolsHidden === true);

  await page.evaluate(async () => { await window.__GA_TEST.loadDemoSample("test-nico"); });
  ok("Nico sample loads a fresh photo", (await page.evaluate(() => window.__GA_TEST.state().files.map((f) => f.name).join())) === "nico-science-check.jpg");
  await page.click(".attach-remove");
  ok("remove (×) drops that photo", (await page.evaluate(() => window.__GA_TEST.state().files.length)) === 0);

  await page.evaluate(async () => { await window.__GA_TEST.loadDemoSample("test-maya"); });
  await page.click("#t-clear-photos");
  ok("Clear photos empties the list", (await page.evaluate(() => window.__GA_TEST.state().files.length)) === 0);

  const dropped = await page.evaluate(async () => {
    const T = window.__GA_TEST;
    const html = new File([new Blob(["<!doctype html><title>404</title>"], { type: "text/html" })], "maya-science-check.jpg", { type: "image/jpeg" });
    const n = await T.addFiles([html]);
    return { dropped: n, files: T.state().files.length, status: document.getElementById("ai-status").textContent };
  });
  ok("undecodable photo is dropped with a message, not attached", dropped.dropped === 1 && dropped.files === 0 && /could not be read/.test(dropped.status));

  const healed = await page.evaluate(async () => {
    const T = window.__GA_TEST;
    const st = T.state();
    st.files = [{ name: "stuck.jpg", type: "image/jpeg", size: 20, url: "data:image/jpeg;base64,not-a-jpeg", blobUrl: null, dataUrl: "data:image/jpeg;base64,not-a-jpeg" }];
    T.saveDraft();
    const n = await T.purgeUndecodablePhotos();
    return { n, files: T.state().files.length, status: document.getElementById("ai-status").textContent };
  });
  ok("self-heal purges a persisted undecodable photo", healed.n === 1 && healed.files === 0 && /saved photo could not be read/.test(healed.status));

  // v27: sample-sourced photos are not persisted; teacher uploads still are.
  await page.evaluate(async () => { await window.__GA_TEST.loadDemoSample("test-maya"); });
  ok("Maya sample photo is in memory before save", (await page.evaluate(() => window.__GA_TEST.state().files.length)) === 1);
  const queued = await page.evaluate(() => {
    const T = window.__GA_TEST;
    T.saveDraft();
    const raw = Object.keys(localStorage).filter((k) => k.includes("teacher-queue")).map((k) => localStorage.getItem(k)).join("\n");
    const names = [];
    try {
      Object.keys(localStorage).filter((k) => k.includes("teacher-queue")).forEach((k) => {
        const q = JSON.parse(localStorage.getItem(k) || "null");
        (q && q.students || []).forEach((st) => (st.files || []).forEach((f) => names.push(f.name || "")));
      });
    } catch (e) {}
    return { raw, names, flagged: T.state().files.some((f) => f.fromSample) };
  });
  ok("sample photo is marked fromSample in memory", queued.flagged === true);
  ok("sample photo is not written to the saved queue", !/maya-science-check/i.test(queued.raw) && queued.names.every((n) => !/maya-science-check/i.test(n)));

  const uploadKeep = await page.evaluate(async () => {
    const T = window.__GA_TEST;
    T.clearPhotos();
    const src = T.sampleSrc("samples/maya-science-check.jpg");
    const res = await fetch(src);
    const buf = await res.arrayBuffer();
    const file = new File([buf], "my-scan.jpg", { type: "image/jpeg" });
    await T.addFiles([file]);
    T.saveDraft();
    const names = [];
    let hasData = false;
    Object.keys(localStorage).filter((k) => k.includes("teacher-queue")).forEach((k) => {
      const q = JSON.parse(localStorage.getItem(k) || "null");
      (q && q.students || []).forEach((st) => (st.files || []).forEach((f) => {
        names.push(f.name || "");
        if (f.dataUrl && f.dataUrl.indexOf("data:image") === 0) hasData = true;
      }));
    });
    return { names, hasData, fromSample: !!(T.state().files[0] && T.state().files[0].fromSample) };
  });
  ok("teacher upload is persisted", uploadKeep.names.includes("my-scan.jpg") && uploadKeep.hasData === true && uploadKeep.fromSample === false);

  const legacy = await page.evaluate(async () => {
    const T = window.__GA_TEST;
    const st = T.state();
    st.files = [
      { name: "maya-science-check.jpg", type: "image/jpeg", size: 20, url: "data:image/jpeg;base64,/9j/4AAQ", blobUrl: null, dataUrl: "data:image/jpeg;base64,/9j/4AAQ" },
      { name: "my-scan.jpg", type: "image/jpeg", size: 20, url: "data:image/jpeg;base64,/9j/4AAQ", blobUrl: null, dataUrl: "data:image/jpeg;base64,/9j/4AAQ" }
    ];
    const n = T.dropSamplePhotos();
    T.saveDraft();
    return { n, names: st.files.map((f) => f.name) };
  });
  ok("on load, a persisted sample photo is purged and a teacher upload is kept", legacy.n === 1 && legacy.names.join() === "my-scan.jpg");

  // Public demo: after a reload, the dropdown returns to the default bus paper
  // and must not keep the Science Check photo attached to it.
  const demo = await ctx.newPage();
  demo.on("pageerror", (e) => errors.push("demo: " + e.message));
  await demo.goto(BASE + "?demo");
  await demo.waitForFunction(() => window.GA_DEMO && window.__GA_TEST, null, { timeout: 15000 });
  await demo.waitForSelector("#demo-sample");
  await demo.evaluate(async () => { await window.__GA_TEST.loadDemoSample("test-maya"); });
  ok("demo science sample loads a photo", (await demo.evaluate(() => window.__GA_TEST.state().files.map((f) => f.name).join())) === "maya-science-check.jpg");
  await demo.reload({ waitUntil: "domcontentloaded" });
  await demo.waitForFunction(() => window.GA_DEMO && window.__GA_TEST, null, { timeout: 15000 });
  await demo.waitForSelector("#demo-sample");
  // applyPublicDemo loads the default bus sample asynchronously after the photo is dropped
  await demo.waitForFunction(() => {
    const st = window.__GA_TEST && window.__GA_TEST.state();
    return st && /last bus ticket/i.test(st.story || "");
  }, null, { timeout: 15000 });
  const afterReload = await demo.evaluate(() => {
    const T = window.__GA_TEST;
    const st = T.state();
    return {
      sample: (document.getElementById("demo-sample") || {}).value || "",
      files: (st.files || []).map((f) => f.name),
      student: st.student,
      story: (st.story || "").slice(0, 80)
    };
  });
  ok("demo reload does not keep the science photo on the bus paper", afterReload.sample === "bus" && afterReload.files.length === 0 && afterReload.student === "Maya" && /wanted to get to the library/.test(afterReload.story));
  const wording = await demo.evaluate(() => {
    const hero = (document.getElementById("teacher-hero-p") || document.querySelector("#teacher-view .hero p") || {}).textContent || "";
    const privacy = (document.getElementById("teacher-privacy") || document.querySelector("#teacher-view .privacy") || {}).textContent || "";
    return hero + " " + privacy;
  });
  ok("demo page names the 10-paper per-network cap and warns not to upload real work", /Up to 10 sample papers or tests per day per network/.test(wording) && /Use fictional samples only/.test(wording) && /Don't upload real student work/.test(wording) && !/nothing is stored on the server/.test(wording) && !/about 3 papers/.test(wording));
  await demo.close();

  ok("no page errors", errors.length === 0 || (console.log(errors), false));
  await browser.close();
  console.log(`\n${n} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
