// Engine-level check: in every lens view, no two rows share a sentence frame, and nothing is cut with an ellipsis.
global.window = {}; require('../engine.js'); const E = window.StorigenEngine;
const IDS = E.LENSES.map(l => l.id);
const frame = q => q.toLowerCase().replace(/[^a-z’' ]/g, '').split(/\s+/).slice(0, 3).join(' ');
module.exports = function frames(check) {
  const DON = { character: 'Kim', goal: 'Hey holes very important secrets', obstacle: 'It is locked and she does not have the key', perspective: 'That the journal May belong to someone else', twist: 'She has been the key the whole time' };
  const cases = [
    ['The idea is about a girl, a locked door and a journal', DON],
    ['A girl finds a locked door in her school.', DON],
    ['A lonely robot discovers a flower on Mars', null], ['Why do volcanoes erupt?', null], ['Grade 4 — ecosystems', null], ['I keep putting off my homework', null], ['a dragon who is afraid of fire', null]
  ];
  for (const [idea, given] of cases) {
    const c = E.analyze(idea), A = {}, qs = [];
    for (const id of IDS) { const q = E.questionFor(c, id, A); qs.push(q.question + ' ' + (q.hint || '') + ' ' + q.chips.join(' ')); A[id] = { text: given ? (given[id] || q.chips[0]) : q.chips[0] }; }
    check(`frames [${idea}]: main-flow questions have no ellipsis`, !qs.some(t => /…|\.\.\./.test(t)), qs.find(t => /…|\.\.\./.test(t)));
    const mq = qs.map(t => t.split('?')[0]);
    check(`frames [${idea}]: main-flow questions are all different`, new Set(mq).size === mq.length);
    let dup = [], ell = [];
    for (const v of IDS) {
      const rows = ['idea'].concat(IDS).filter(o => o !== v).map(o => E.reframe(c, v, o, o === 'idea' ? null : A[o].text, A)).filter(Boolean);
      const f = rows.map(frame);
      if (new Set(f).size !== f.length) dup.push(v + ': ' + rows.join(' / '));
      rows.forEach(r => { if (/…|\.\.\./.test(r)) ell.push(r); });
      if (given && v === 'twist') check(`frames [${idea}]: Don's Twist view has ${rows.length} distinct rows`, rows.length >= 5 && new Set(f).size === rows.length, rows.join(' | '));
    }
    check(`frames [${idea}]: no shared sentence frame in any of the 7 views`, dup.length === 0, dup.join(' || '));
    check(`frames [${idea}]: no "…" or "..." in any reframe`, ell.length === 0, ell.join(' | '));
  }
  check('tidy: sentence-cases and drops filler/stray caps', E.tidy('Hey holes very important secrets') === 'Holes very important secrets' && E.tidy('That the journal May belong to someone else') === 'That the journal may belong to someone else', E.tidy('That the journal May belong to someone else'));
};
if (require.main === module) { let bad = 0; module.exports((n, ok, i) => { if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (i && !ok ? ' :: ' + i : '')); }); process.exit(bad ? 1 : 0); }
