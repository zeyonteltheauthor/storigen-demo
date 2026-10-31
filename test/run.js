const { chromium } = require('playwright');
const path = require('path');
const SHOTS = path.join(__dirname, '..', 'screenshots');
const URL = process.env.BASE || 'http://127.0.0.1:4173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, cond, info) { results.push({ name, ok: !!cond, info }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (info ? ' :: ' + info : '')); }


// Every scaffold word must come from this fixed list: function words + the spine's own connective labels. No plot nouns.
const SCAFFOLD_OK = new Set(('a an and the of in on to for with at by from as is are was be been it its it\'s this that these those what where when who why how which if but or so ' +
  'she he they her him them their his hers theirs i you your yours we our one all only first just here there not doesn\'t don\'t isn\'t aren\'t can\'t ' +
  'world begins begin meet center wants want has have goal way stands stand stake stakes walks walk away realize twist moment comes come out lose would ' +
  'get past because word words story question problem started start asked found involved trying do try solved looks look happens happen another angle could change ' +
  'matters matter know move open investigate turn hook students student grade through work works lesson lessons ideas idea say exit ticket every underlined came from storigen only asked thinking ' +
  'who\'s what\'s you\'re that\'s here\'s there\'s like grey join together exactly chose underlined yours new step steps plus right before everything changes things thing them gets reveal opens they\'re').split(/\s+/));
// Teacher mode keeps the existing fixed 7-step pedagogy (the same words as the plan modal); only the learner's topic/answers are theirs.
const TEACH_OK = 'explore ask rules characters identify sort lives name defend answer target find obstacle list makes hard most weigh predict fail switch perspective small groups each take view explain same event introduce revise map changed lens helped understand evidence shows s'.split(' ');
async function revealChecks(page, slug, opts = {}) {
  await page.waitForSelector('#reveal:not([hidden])', { timeout: 6000 }).catch(() => {});
  const open = await page.locator('#reveal:not([hidden])').count();
  check(`${slug}: story reveal opens after the lenses`, open === 1);
  if (!open) return;
  await sleep(opts.wait || 2600);
  const info = await page.evaluate(() => {
    const s = window.__storigen.state(), E = window.StorigenEngine;
    const text = document.querySelector('#rvInner').innerText.toLowerCase().replace(/\s+/g, ' ');
    const marks = [...document.querySelectorAll('#reveal .rv-acts mark.own, #rvLogline mark.own')].map(m => m.textContent.toLowerCase());
    const missing = Object.keys(s.answers).filter(id => { const t = E.tidy(s.answers[id].text).toLowerCase().replace(/[.!?]+$/, ''); return !marks.some(m => m.includes(t) || t.includes(m) && m.length > t.length * 0.9) && !text.includes(t); });
    const fw = [...document.querySelectorAll('#reveal .rv-acts .fw, #rvLogline .fw, #reveal .rv-step')].map(e => e.textContent).join(' ').toLowerCase();
    return { missing, fw, title: document.querySelector('#rvTitle').innerText, nAnswers: Object.keys(s.answers).length,
      closing: document.querySelector('.rv-closing').innerText, logMarks: document.querySelectorAll('#rvLogline mark.own').length,
      ow: document.querySelector('#reveal').scrollWidth - document.querySelector('#reveal').clientWidth, docOw: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  check(`${slug}: reveal title "${info.title}"`, /in your words|learning experience/i.test(info.title));
  check(`${slug}: every answer (${info.nAnswers}) appears in full in the spine`, info.missing.length === 0, info.missing.join(','));
  const OK = opts.teacher ? new Set([...SCAFFOLD_OK, ...TEACH_OK]) : SCAFFOLD_OK;
  const bad = info.fw.replace(/[’‘]/g, "'").replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(w => w && !OK.has(w) && !/^\d+$/.test(w));
  check(`${slug}: scaffold invents no nouns`, bad.length === 0, [...new Set(bad)].join(','));
  check(`${slug}: logline built from the learner's words`, info.logMarks >= 1);
  check(`${slug}: closing line credits the learner`, /came from you\. storigen only asked\./i.test(info.closing));
  check(`${slug}: reveal has no sideways scroll`, info.ow <= 0 && info.docOw <= 0, JSON.stringify(info));
  await page.screenshot({ path: `${SHOTS}/${slug}-reveal.png` });
}

async function flow(browser, { slug, input, viewport, answers, teacher }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  await sleep(1300);
  await page.screenshot({ path: `${SHOTS}/${slug}-01-opening.png` });
  // opening screen has one prompt + one box
  const visibleButtons = await page.locator('#intro button:visible').count();
  check(`${slug}: opening minimal (1 input, 1 submit)`, (await page.locator('#intro input:visible').count()) === 1 && visibleButtons === 1);
  const bodyTxt = await page.locator('body').innerText();
  check(`${slug}: no "Welcome to STORIGEN OS"`, !/welcome to storigen/i.test(bodyTxt));
  if (input !== null) await page.fill('#ideaInput', input);
  await page.keyboard.press('Enter');
  await sleep(2200);
  await page.screenshot({ path: `${SHOTS}/${slug}-02-lenses-appear.png` });
  const lensCount = await page.locator('.node.lens').count();
  check(`${slug}: seven lenses around idea`, lensCount === 7);
  const q1 = await page.locator('#qText').innerText();
  check(`${slug}: one question shown`, (await page.locator('.qtext').count()) === 1, q1);
  const qs = [q1];
  for (let i = 0; i < answers.length; i++) {
    const a = answers[i];
    if (a === 'chip') await page.locator('.chip').first().click();
    else if (a === 'skip') await page.locator('[data-act="skip"]').click();
    else { await page.fill('#ansInput', a); await page.keyboard.press('Enter'); }
    await sleep(1500);
    if (i === 0) await page.screenshot({ path: `${SHOTS}/${slug}-03-first-answer.png` });
    // know moment
    if (await page.locator('.know h2').count() && i < 6) {
      const t = await page.locator('.know h2').innerText();
      if (/Look what you already know/.test(t) && !qs.includes('KNOW')) {
        qs.push('KNOW');
        await sleep(600);
        await page.screenshot({ path: `${SHOTS}/${slug}-04-look-what-you-know.png` });
        check(`${slug}: "Look what you already know." after 3 answers`, (await page.locator('.done').count()) === 3);
        await page.locator('[data-act="continue"]').click();
        await sleep(700);
      }
    }
    if (await page.locator('.qtext').count() && !(await page.locator('.know').count())) qs.push(await page.locator('#qText').innerText());
  }
  console.log('   questions:', JSON.stringify(qs));
  await revealChecks(page, slug, { teacher });
  if (await page.locator('#reveal:not([hidden])').count()) { await page.locator('[data-rv="map"]').click(); await sleep(500); }
  check(`${slug}: "${teacher ? 'See your learning experience' : 'See what you built'}" button on the map`, (await page.locator('[data-act="built"]').count()) > 0);
  await sleep(800);
  await page.screenshot({ path: `${SHOTS}/${slug}-05-map-complete.png` });
  const doneNodes = await page.locator('.node.lens.done').count();
  check(`${slug}: map has answered nodes`, doneNodes >= 5, doneNodes + ' nodes');
  const arcs = await page.locator('#links path.arc').count();
  check(`${slug}: map links grew`, arcs >= 3, arcs + ' arcs');
  // perspective
  await page.locator('.lens-cta').first().click();
  await sleep(2000);
  await page.screenshot({ path: `${SHOTS}/${slug}-06-perspective-view.png` });
  const centerIsPersp = await page.locator('#node-perspective.center').count();
  check(`${slug}: perspective re-centers map`, centerIsPersp === 1);
  const rf = await page.locator('.node.reframed').count();
  check(`${slug}: nodes reframed in perspective view`, rf >= 3, rf + ' reframed');
  const pos = await page.evaluate(() => { const s = window.__storigen.state(); return { p: [s.nodes.perspective.x, s.nodes.perspective.y], c: [document.querySelector('#stage').clientWidth / 2, document.querySelector('#stage').clientHeight / 2] }; });
  check(`${slug}: perspective node at center`, Math.abs(pos.p[0] - pos.c[0]) < 3 && Math.abs(pos.p[1] - pos.c[1]) < 3);
  check(`${slug}: footer principle visible`, await page.locator('.principle').isVisible());
  // overlap check of nodes in final view
  const overlaps = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.node .inner')].map(e => e.getBoundingClientRect());
    let n = 0; for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i], b = els[j]; const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); if (ox > 6 && oy > 6) n++; }
    const st = document.querySelector('#stage').getBoundingClientRect();
    const off = els.filter(r => r.left < st.left - 2 || r.right > st.right + 2 || r.top < st.top - 2 || r.bottom > st.bottom + 2).length;
    return { n, off };
  });
  check(`${slug}: no overlapping/offscreen nodes (perspective view)`, overlaps.n === 0 && overlaps.off === 0, JSON.stringify(overlaps));
  if (teacher) {
    const btn = page.locator('[data-act="plan"]');
    check(`${slug}: teacher "Turn this into a learning experience"`, await btn.count() > 0);
    if (await btn.count()) { await btn.first().click(); await sleep(1200); await page.screenshot({ path: `${SHOTS}/${slug}-07-learning-experience.png` }); check(`${slug}: plan has 7 steps`, (await page.locator('.plan li').count()) === 7); await page.locator('#planClose').click(); }
  }
  // back to idea
  await page.locator('[data-act="back"]').click(); await sleep(1500);
  const overlaps2 = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.node .inner')].map(e => e.getBoundingClientRect());
    let n = 0; for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i], b = els[j]; const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); if (ox > 6 && oy > 6) n++; }
    return n;
  });
  check(`${slug}: no overlapping nodes (idea view)`, overlaps2 === 0, String(overlaps2));
  check(`${slug}: no JS errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// Don's phone bug report: his exact inputs, sound ON, every lens view cycled.
async function soundAndDon(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL); await sleep(900);
  const t = page.locator('#soundToggle');
  check('sound: toggle visible and labelled', await t.isVisible() && (await t.getAttribute('aria-label')) === 'Sound effects');
  check('sound: OFF by default', (await t.getAttribute('aria-pressed')) === 'false' && await page.evaluate(() => !window.__storigen.sound.isOn()));
  await t.click(); await sleep(200);
  check('sound: click turns it on (aria-pressed + localStorage)', (await t.getAttribute('aria-pressed')) === 'true' && await page.evaluate(() => localStorage.getItem('storigen.sound') === 'on'));
  await page.reload(); await sleep(900);
  check('sound: choice remembered after reload', (await page.locator('#soundToggle').getAttribute('aria-pressed')) === 'true');
  await page.keyboard.press('Tab'); // the toggle is reachable but the idea box keeps focus first
  await page.fill('#ideaInput', 'The idea is about a girl, a locked door and a journal');
  await page.locator('#ideaInput').press('Enter'); await sleep(2200);
  const noScroll = await page.evaluate(() => { const p = document.querySelector('#panel'); return { sh: p.scrollHeight, ch: p.clientHeight }; });
  check('mobile: question panel fits without scrolling', noScroll.sh <= noScroll.ch + 1, JSON.stringify(noScroll));
  const DON = ['Kim', 'Hey holes very important secrets', 'It is locked and she does not have the key', 'chip', 'That the journal May belong to someone else', 'chip', 'She has been the key the whole time'];
  for (const a of DON) {
    if (await page.locator('[data-act="continue"]').count() && !(await page.locator('.qtext').count() && await page.locator('#ansInput').count())) { await page.locator('[data-act="continue"]').first().click(); await sleep(600); }
    if (a === 'chip') await page.locator('.chip').first().click(); else { await page.fill('#ansInput', a); await page.locator('#ansInput').press('Enter'); }
    await sleep(1400);
  }
  await page.waitForSelector('#reveal:not([hidden])', { timeout: 6000 }).catch(() => {});
  await sleep(400);
  await page.screenshot({ path: `${SHOTS}/G-don-story-reveal-phone-00-transition.png` });
  await revealChecks(page, 'G-don-phone', { wait: 2400 });
  await page.screenshot({ path: `${SHOTS}/G-don-story-reveal-phone-01.png` });
  await page.evaluate(() => document.querySelector('#reveal').scrollTo(0, document.querySelector('.rv-act[data-act-id="middle"]').offsetTop - 40)); await sleep(400);
  await page.screenshot({ path: `${SHOTS}/G-don-story-reveal-phone-02-acts.png` });
  await page.locator('.rv-tell').scrollIntoViewIfNeeded(); await sleep(300);
  await page.screenshot({ path: `${SHOTS}/G-don-story-reveal-phone-03-insights.png` });
  await page.locator('.rv-q').first().click(); await page.locator('.rv-qform:not([hidden]) input').fill('curious'); await page.locator('.rv-qform:not([hidden]) .add').click(); await sleep(900);
  await page.screenshot({ path: `${SHOTS}/G-don-story-reveal-phone-04-live-update.png` });
  check('don phone: next-move answer slots into the spine', /meet kim, curious\./i.test(await page.locator('.rv-acts').innerText()));
  await page.locator('[data-rv="write"]').click(); await page.fill('#firstLine', 'Kim pressed her ear to the locked door.'); await page.locator('#firstForm .add').click(); await sleep(900);
  await page.screenshot({ path: `${SHOTS}/G-don-story-reveal-phone-05-first-line.png` });
  const pow = await page.evaluate(() => { const r = document.querySelector('#reveal'); const wide = [...r.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).length; return { ow: r.scrollWidth - r.clientWidth, wide }; });
  check('don phone: reveal layout has no overflow', pow.ow <= 0 && pow.wide === 0, JSON.stringify(pow));
  await page.locator('[data-rv="map"]').click(); await sleep(600);
  check('don phone: "See what you built" stays on the map', (await page.locator('[data-act="built"]').count()) > 0);
  await page.screenshot({ path: `${SHOTS}/F-don-phone-01-map.png` });
  const nodeTxt = await page.locator('#nodes').innerText();
  check("don: map nodes show full answers (no '…')", !/…|\.\.\./.test(nodeTxt) && nodeTxt.includes('It is locked and she does not have the key'), nodeTxt.replace(/\s+/g, ' ').slice(0, 160));
  const clipped = await page.evaluate(() => [...document.querySelectorAll('.node .ans, .node .txt')].filter(e => e.offsetParent && e.scrollHeight > e.clientHeight + 2).length);
  check('don: no clipped answer text on nodes', clipped === 0, String(clipped));
  const seen = {};
  for (let i = 0; i < 7; i++) {
    await page.locator('.lens-cta').first().click(); await sleep(1300);
    const view = await page.evaluate(() => window.__storigen.state().view);
    const rows = await page.locator('.view-list li .rq').allInnerTexts();
    const said = await page.locator('.view-list li .said').allInnerTexts();
    const frames = rows.map(r => r.toLowerCase().replace(/[^a-z’' ]/g, '').split(/\s+/).slice(0, 3).join(' '));
    seen[view] = rows;
    check(`don: ${view} view - ${rows.length} rows, no shared frame`, rows.length >= 4 && new Set(frames).size === frames.length, rows.join(' | '));
    const txt = await page.locator('#panelInner').innerText();
    check(`don: ${view} view - no '…' or '...'`, !/…|\.\.\./.test(txt));
    if (view === 'twist') {
      await page.screenshot({ path: `${SHOTS}/F-don-phone-02-twist-view.png` });
      await page.locator('.view-list').scrollIntoViewIfNeeded(); await sleep(300);
      await page.screenshot({ path: `${SHOTS}/F-don-phone-03-twist-rows.png` });
      check("don: twist view shows Don's full answers", said.some(s => s.includes('It is locked and she does not have the key')) && said.some(s => s.includes('That the journal may belong to someone else')), said.join(' | '));
      check('don: twist rows do not use the old robotic template', !rows.some(r => /isn.t what it seems/i.test(r)));
    }
  }
  check('don: all 7 lens views visited', Object.keys(seen).length === 7, Object.keys(seen).join(','));
  const played = await page.evaluate(() => window.__storigen.sound.played.slice());
  const has = n => played.includes(n);
  check('sound ON: chime, land, swell and whoosh cues all played', has('chime') && has('land') && has('swell') && has('whoosh'), [...new Set(played)].join(','));
  check('sound ON: reveal cue played for the story', has('reveal'));
  // mute and keep going: no errors, nothing new plays
  await page.locator('#soundToggle').click(); await sleep(100);
  const before = await page.evaluate(() => window.__storigen.sound.played.length);
  await page.locator('.lens-cta').first().click(); await sleep(900);
  await page.locator('[data-act="back"]').click(); await sleep(900);
  check('sound OFF: no cues play once muted', (await page.evaluate(() => window.__storigen.sound.played.length)) === before);
  check('sound: muted choice saved', await page.evaluate(() => localStorage.getItem('storigen.sound') === 'off'));
  const labelHits = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('.node .inner')].map(e => e.getBoundingClientRect());
    return [...document.querySelectorAll('#links .arc-label:not(.hide)')].filter(l => { const r = l.getBoundingClientRect(); return boxes.some(b => r.left < b.right - 2 && r.right > b.left + 2 && r.top < b.bottom - 2 && r.bottom > b.top + 2); }).length;
  });
  check('links: no arc label sits on top of a node', labelHits === 0, String(labelHits));
  check('don + sound: no JS errors (muted and unmuted)', errors.length === 0, errors.join(' | '));
  await ctx.close();
}


// Don's exact inputs on desktop: the full payoff, insights, a live update, first line, print, actions.
async function donDesktop(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { localStorage.setItem('storigen.sound', 'on'); window.__printed = 0; window.print = () => { window.__printed++; }; });
  await page.goto(URL); await sleep(900);
  await page.fill('#ideaInput', 'The idea is about a girl, a locked door and a journal');
  await page.locator('#ideaInput').press('Enter'); await sleep(2200);
  const DON = ['Kim', 'Hey holes very important secrets', 'It is locked and she does not have the key', 'She loses her only chance', 'That the journal May belong to someone else', 'Everything is watched', 'She has been the key the whole time'];
  for (let i = 0; i < DON.length; i++) {
    if (await page.locator('[data-act="continue"]').count() && !(await page.locator('#ansInput').count())) { await page.locator('[data-act="continue"]').first().click(); await sleep(600); }
    if (i === 5) check('don desktop: "See what you built" appears after 5 answers', (await page.locator('[data-act="built"]').count()) > 0);
    await page.fill('#ansInput', DON[i]); await page.locator('#ansInput').press('Enter'); await sleep(1400);
  }
  await page.waitForSelector('#reveal:not([hidden])', { timeout: 6000 }).catch(() => {});
  await sleep(450);
  await page.screenshot({ path: `${SHOTS}/G-don-story-reveal-desktop-00-transition.png` });
  await revealChecks(page, 'G-don-desktop', { wait: 2400 });
  await page.screenshot({ path: `${SHOTS}/G-don-story-reveal-desktop-01.png` });
  const r = await page.evaluate(() => ({ log: document.querySelector('#rvLogline').innerText, acts: document.querySelector('.rv-acts').innerText, tell: document.querySelector('.rv-tell').innerText,
    strength: [...document.querySelectorAll('.rv-strength')].map(e => +e.getAttribute('aria-valuenow')) }));
  console.log('   logline:', r.log);
  check("don desktop: logline is Don's words", /everything is watched/i.test(r.log) && /Kim/.test(r.log) && /it is locked and she does not have the key/i.test(r.log));
  for (const t of ['Kim', 'holes very important secrets', 'it is locked and she does not have the key', 'she loses her only chance', 'that the journal may belong to someone else', 'everything is watched', 'she has been the key the whole time'])
    check(`don desktop: spine includes "${t}"`, r.acts.toLowerCase().includes(t.toLowerCase()));
  check('don desktop: three acts BEGINNING / MIDDLE / TURN', /beginning[\s\S]*middle[\s\S]*turn/i.test(r.acts));
  check('don desktop: connection links the locked door and the journal (as a question)', /locked door[^?]*journal[^?]*\?/i.test(r.tell), r.tell.split('\n').find(l => /locked door/i.test(l)));
  check('don desktop: connection links obstacle key and twist key', /doesn.t have the key[\s\S]*has been the key[^?]*\?/i.test(r.tell));
  check('don desktop: tension names the big stakes vs the fuzzy goal', /stakes are big[\s\S]*only chance[\s\S]*goal is still fuzzy[^?]*\?/i.test(r.tell));
  const insightLines = await page.locator('.rv-ins p').allInnerTexts();
  check('don desktop: every insight is phrased as a question or a gap', insightLines.every(l => /\?$|gap there\.$|stronger\.$/.test(l.trim())), insightLines.join(' | '));
  const moves = await page.locator('.rv-q').count();
  check('don desktop: 2-3 tappable next moves', moves >= 2 && moves <= 3, String(moves));
  check('don desktop: story strength shown per act', r.strength.length === 3, r.strength.join(','));
  await page.locator('.rv-tell').scrollIntoViewIfNeeded(); await sleep(500);
  await page.screenshot({ path: `${SHOTS}/G-don-story-reveal-desktop-02-insights.png` });
  // answer two next moves; each slots a new highlighted phrase into the spine live
  const marks0 = await page.locator('.rv-acts mark.own').count();
  await page.locator('.rv-q[data-slot="goalWhy"]').click(); await page.locator('.rv-qform[data-slot="goalWhy"] input').fill('they could free her brother'); await page.locator('.rv-qform[data-slot="goalWhy"] .add').click();
  await sleep(500);
  await page.screenshot({ path: `${SHOTS}/G-don-story-reveal-desktop-03-live-update.png` });
  await page.locator('.rv-q[data-slot="reveal"]').click(); await page.locator('.rv-qform[data-slot="reveal"] input').fill('when she reads her own name in it'); await page.locator('.rv-qform[data-slot="reveal"] .add').click();
  await sleep(1300);
  const after = await page.evaluate(() => ({ acts: document.querySelector('.rv-acts').innerText, marks: document.querySelectorAll('.rv-acts mark.own').length, added: [...document.querySelectorAll('.rv-acts mark.added')].map(m => m.textContent), strength: [...document.querySelectorAll('.rv-strength')].map(e => +e.getAttribute('aria-valuenow')) }));
  check('don desktop: live update adds new highlighted phrases', after.marks === marks0 + 2 && after.added.includes('they could free her brother'), after.added.join(' | '));
  check('don desktop: new phrase lands in MIDDLE and TURN', /Because they could free her brother\./.test(after.acts) && /comes out: when she reads her own name in it\./.test(after.acts));
  check('don desktop: story strength brightens as answers deepen', after.strength[1] > r.strength[1] && after.strength[2] > r.strength[2], r.strength + ' -> ' + after.strength);
  check('don desktop: answered moves are replaced by new ones', !(await page.locator('.rv-q[data-slot="goalWhy"]').count()));
  await page.locator('.rv-act[data-act-id="middle"]').scrollIntoViewIfNeeded(); await sleep(300);
  await page.screenshot({ path: `${SHOTS}/G-don-story-reveal-desktop-04-story-grew.png` });
  // write the first line: prompt only, the learner's text is what lands
  await page.locator('[data-rv="write"]').click(); await sleep(400);
  const seed = await page.locator('.rv-seed').innerText();
  check('write first line: seeded by a prompt only', /Start where Kim first sees the locked door\./.test(seed) && (await page.locator('#firstLine').inputValue()) === '', seed);
  check('write first line: add disabled until text', await page.locator('#firstForm .add').isDisabled());
  await page.fill('#firstLine', 'The door had no handle, only a keyhole shaped like a star.');
  await page.locator('#firstForm .add').click(); await sleep(900);
  const fl = await page.locator('.rv-first').innerText().catch(() => '');
  check('write first line: learner text appended, highlighted', /The door had no handle, only a keyhole shaped like a star\./.test(fl) && (await page.locator('.rv-first mark.own').count()) === 1);
  check('write first line: button becomes "Edit my first line"', /Edit my first line/.test(await page.locator('[data-rv="write"]').innerText()));
  await page.screenshot({ path: `${SHOTS}/G-don-story-reveal-desktop-05-first-line.png` });
  // print view
  await page.locator('[data-rv="print"]').click();
  check('print: button calls window.print()', (await page.evaluate(() => window.__printed)) === 1);
  await page.emulateMedia({ media: 'print' }); await sleep(300);
  const pr = await page.evaluate(() => ({ map: getComputedStyle(document.querySelector('#nodes')).display !== 'none' && document.querySelectorAll('#nodes .node').length, rv: getComputedStyle(document.querySelector('#reveal')).position,
    btns: [...document.querySelectorAll('.rv-actions')].every(e => getComputedStyle(e).display === 'none'), bg: getComputedStyle(document.querySelector('#reveal')).backgroundColor }));
  await page.pdf({ path: `${SHOTS}/G-don-story-reveal-print.pdf`, format: 'Letter', printBackground: true });
  await page.screenshot({ path: `${SHOTS}/G-don-story-reveal-print.png`, fullPage: true });
  check('print: map and spine both render, buttons hidden, white page', pr.map >= 8 && pr.rv === 'static' && pr.btns && /255, 255, 255/.test(pr.bg), JSON.stringify(pr));
  await page.emulateMedia({ media: 'screen' }); await sleep(200);
  // see it through another lens -> back -> reopen -> new idea
  await page.locator('[data-rv="lens"]').click(); await sleep(1500);
  check('"See it through another lens" closes reveal into perspective view', (await page.locator('#reveal[hidden]').count()) === 1 && (await page.evaluate(() => window.__storigen.state().view)) === 'perspective');
  await page.locator('[data-act="built"]').first().click(); await sleep(1800);
  check('"See what you built" reopens the story, extras kept', (await page.locator('#reveal:not([hidden])').count()) === 1 && /free her brother/.test(await page.locator('.rv-acts').innerText()));
  await page.keyboard.press('Escape'); await sleep(300);
  check('Escape closes the story', (await page.locator('#reveal[hidden]').count()) === 1);
  await page.locator('[data-act="built"]').first().click(); await sleep(1500);
  await page.locator('[data-rv="new"]').click(); await sleep(900);
  check('"Start a new idea" returns to the opening', await page.locator('#ideaInput').isVisible() && (await page.locator('#reveal[hidden]').count()) === 1);
  const played = await page.evaluate(() => window.__storigen.sound.played.slice());
  check('sound: reveal cue played', played.includes('reveal'));
  check('don desktop: no JS errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// One online visit fills the cache. Offline reload must still render and finish a lens flow.
async function offlineFlow(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 });
  check('offline: service worker controls the page', !!(await page.evaluate(() => navigator.serviceWorker.controller)));
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load', timeout: 15000 });
  const rendered = await page.locator('#ideaInput').isVisible() && await page.evaluate(() => !!(window.StorigenEngine && window.__storigen));
  check('offline: app renders after reload', rendered);
  await page.fill('#ideaInput', 'A girl finds a locked door in her school.');
  await page.keyboard.press('Enter');
  await sleep(2200);
  check('offline: seven lenses around the idea', (await page.locator('.node.lens').count()) === 7);
  const answers = ['Maya', 'chip', 'chip', 'chip', 'chip', 'chip', 'chip'];
  for (let i = 0; i < answers.length; i++) {
    const a = answers[i];
    if (a === 'chip') await page.locator('.chip').first().click();
    else { await page.fill('#ansInput', a); await page.keyboard.press('Enter'); }
    await sleep(1500);
    if (await page.locator('.know h2').count() && i < 6) {
      const t = await page.locator('.know h2').innerText();
      if (/Look what you already know/.test(t)) {
        await page.locator('[data-act="continue"]').click();
        await sleep(700);
      }
    }
  }
  await revealChecks(page, 'offline', { wait: 2600 });
  check('offline: no JS errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

(async () => {
  require('./frames.js')(check);
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const desk = { width: 1440, height: 900 }, phone = { width: 390, height: 844 };
  await flow(browser, { slug: 'A-story-desktop', input: null, viewport: desk, answers: ['Maya', 'chip', 'chip', 'chip', 'chip', 'chip', 'chip'] });
  await flow(browser, { slug: 'B-question-desktop', input: 'Why do volcanoes erupt?', viewport: desk, answers: ['magma', 'chip', 'chip', 'skip', 'chip', 'chip', 'chip'] });
  await flow(browser, { slug: 'C-robot-mobile', input: 'A lonely robot discovers a flower on Mars', viewport: phone, answers: ['Rivet', 'chip', 'chip', 'chip', 'chip', 'old', 'chip'] });
  await flow(browser, { slug: 'D-teacher-desktop', input: 'Grade 4 — ecosystems', viewport: desk, answers: ['chip', 'chip', 'chip', 'chip', 'chip', 'chip', 'chip'], teacher: true });
  await flow(browser, { slug: 'E-problem-tablet', input: 'I keep putting off my homework', viewport: { width: 820, height: 1180 }, answers: ['chip', 'done before dinner', 'my phone', 'chip', 'chip', 'chip', 'chip'] });
  await donDesktop(browser);
  await soundAndDon(browser);
  await offlineFlow(browser);
  await browser.close();
  const f = results.filter(r => !r.ok);
  console.log(`\n${results.length - f.length}/${results.length} checks passed`);
  require('fs').writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(results, null, 2));
})();
