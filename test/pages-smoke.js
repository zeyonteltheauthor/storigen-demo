// Usage: node pages-smoke.js [baseUrl]   (default: https://zeyonteltheauthor.github.io/storigen-demo/)
const { chromium } = require('playwright');
const BASE = process.argv[2] || process.env.BASE || 'https://zeyonteltheauthor.github.io/storigen-demo/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [], bad = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  await p.goto(BASE, { waitUntil: 'networkidle' });
  const fonts = await p.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter(f => f.status === 'loaded').length; });
  const engine = await p.evaluate(() => !!window.StorigenEngine);
  await p.fill('#ideaInput', 'The idea is about a girl, a locked door and a journal'); await p.keyboard.press('Enter'); await sleep(2200);
  for (const a of ['Kim', 'Hey holes very important secrets', 'It is locked and she does not have the key', 'She loses her only chance', 'That the journal May belong to someone else', 'Everything is watched', 'She has been the key the whole time']) {
    if (await p.locator('[data-act="continue"]').count() && !(await p.locator('#ansInput').count())) { await p.locator('[data-act="continue"]').click(); await sleep(600); }
    await p.fill('#ansInput', a); await p.keyboard.press('Enter'); await sleep(1400);
  }
  await p.waitForSelector('#reveal:not([hidden])', { timeout: 8000 }); await sleep(2500);
  const log = await p.locator('#rvLogline').innerText(), ins = await p.locator('.rv-ins').count();
  await p.screenshot({ path: __dirname + '/../screenshots/pages-smoke.png' });
  const ok = engine && fonts > 0 && bad.length === 0 && errs.length === 0 && /Kim/.test(log) && ins >= 3;
  console.log(JSON.stringify({ BASE, ok, engine, fontsLoaded: fonts, failedRequests: bad, errors: errs, logline: log, insights: ins }, null, 1));
  await b.close(); process.exit(ok ? 0 : 1);
})();
