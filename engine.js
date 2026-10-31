/* STORIGEN OS demo — local question engine.
 * No network, no API key. It reads the learner's words, figures out what kind of
 * thinking it is (story idea, topic/question, personal problem, or a teacher's
 * lesson topic) and builds one tailored question per lens. It suggests short
 * possibilities but never writes the learner's answers or story.
 */
(function (global) {
  'use strict';

  var LENSES = [
    { id: 'character',   name: 'Character',   color: '#7C2D12', tint: '#FFEDD5', glyph: 'Person' },
    { id: 'goal',        name: 'Goal',        color: '#0F766E', tint: '#CCFBF1', glyph: 'Target' },
    { id: 'obstacle',    name: 'Obstacle',    color: '#991B1B', tint: '#FEE2E2', glyph: 'Barrier' },
    { id: 'stakes',      name: 'Stakes',      color: '#92400E', tint: '#FEF3C7', glyph: 'Flame' },
    { id: 'perspective', name: 'Perspective', color: '#1E3A8A', tint: '#DBEAFE', glyph: 'Eye' },
    { id: 'world',       name: 'World',       color: '#3F6212', tint: '#ECFCCB', glyph: 'Globe' },
    { id: 'twist',       name: 'Twist',       color: '#7E22CE', tint: '#F3E8FF', glyph: 'Turn' }
  ];

  /* ---------- small helpers ---------- */
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function pick(arr, n, seed) {
    var a = arr.slice(), out = [], s = seed || 1;
    while (a.length && out.length < n) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; out.push(a.splice(s % a.length, 1)[0]); }
    return out;
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function clean(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
  function stripEnd(s) { return clean(s).replace(/[.!?…,;:]+$/, ''); }
  function shorten(s, n) { s = stripEnd(s); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; }

  var ARTICLES = { a: 1, an: 1, the: 1, my: 1, our: 1, one: 1, 'this': 1, that: 1, some: 1, two: 1, three: 1, four: 1, five: 1, his: 1, her: 1, their: 1, your: 1, every: 1, no: 1 };
  var NUMBERS = { two: 1, three: 1, four: 1, five: 1, six: 1, some: 1, many: 1, several: 1 };
  var VERBS = {};
  ('finds found find discovers discovered discover wakes woke wake loses lost lose wants wanted want meets met meet gets got get has had have is was are were ' +
   'sees saw see hears heard hear opens opened open notices noticed notice learns learned learn receives received receive becomes became become runs ran run ' +
   'moves moved move falls fell fall builds built build comes came come goes went go tries tried try must needs needed need lives lived live works worked ' +
   'starts started start keeps kept keep hides hid hide stumbles stumbled realizes realized realize inherits inherited inherit travels traveled travel ' +
   'wonders wondered wonder can cannot cant won\'t can\'t will would steals stole steal breaks broke break follows followed follow creates created create ' +
   'invents invented invent sneaks snuck sneak escapes escaped escape catches caught catch sets leaves left leave arrives arrived arrive returns returned ' +
   'return knows knew know thinks thought think decides decided decide writes wrote write gives gave give takes took take makes made make turns turned turn ' +
   'shows showed fights fought fight tells told tell asks asked ask lands landed land crashes crashed crash appears appeared appear begins began begin ' +
   'dreams dreamed dream sails sailed sail flies flew fly climbs climbed climb digs dug dig unlocks unlocked unlock enters entered enter grows grew grow ' +
   'hatches hatched hatch befriends befriended befriend refuses refused refuse loves loved love hates hated hate shrinks shrank shrink ' +
   'stops stopped stop wins won win plays played play reads read sings sang sing swims swam swim talks talked talk walks walked walk')
    .split(' ').forEach(function (v) { VERBS[v] = 1; });
  var PARTICLES = { up: 1, down: 1, out: 1, away: 1, back: 1, off: 1 };
  var PREPS = { 'in': 1, at: 1, on: 1, inside: 1, under: 1, behind: 1, near: 1, 'with': 1, that: 1, which: 1, and: 1, but: 1, 'while': 1, during: 1, from: 1, to: 1, of: 1, into: 1, beneath: 1, outside: 1, after: 1, before: 1, where: 1, when: 1, who: 1, 'for': 1 };
  var FEMALE = /^(girl|girls|woman|women|lady|princess|queen|mother|mom|mum|grandma|grandmother|sister|daughter|aunt|witch|mermaid|niece|wife|she|her|ballerina|actress|heroine|empress)$/;
  var MALE = /^(boy|boys|man|men|guy|prince|king|father|dad|grandpa|grandfather|brother|son|uncle|wizard|nephew|husband|he|him|hero|emperor)$/;
  var NONHUMAN = /^(robot|dragon|dog|puppy|cat|kitten|alien|fox|owl|bear|wolf|mouse|bird|fish|horse|unicorn|monster|ghost|tree|android|ai|computer|rabbit|bunny|turtle|frog|lion|tiger|elephant|penguin|spider|bee|ant|creature|beast|machine)$/;
  var DOORLIKE = /^(door|doors|gate|box|chest|safe|locker|vault|drawer|room|closet|cabinet|hatch|trapdoor|portal|tunnel|attic|basement|cave)$/;
  var GOAL_VERB = { door: 'opened', gate: 'opened', box: 'opened', chest: 'opened', safe: 'opened', locker: 'opened', vault: 'opened', drawer: 'opened',
    closet: 'opened', cabinet: 'opened', hatch: 'opened', trapdoor: 'opened', portal: 'opened' };
  var GOAL_INF = { map: 'follow', letter: 'read', note: 'read', message: 'decode', diary: 'read', journal: 'read', book: 'read', code: 'crack', puzzle: 'solve',
    mystery: 'solve', riddle: 'solve', egg: 'hatch', machine: 'fix', key: 'use', clue: 'follow', secret: 'keep' };
  var F_NAMES = /^(maya|zuri|ava|nia|rosa|lily|emma|mia|zoe|aaliyah|sofia|amara|luna|olivia|isabella|chloe|grace|sarah|hannah|ella|aria|layla|nora|ruby|jada|imani|keisha|lori|lindsay)$/i;
  var M_NAMES = /^(leo|eli|marcus|kai|theo|noah|liam|jayden|lucas|malik|max|james|jack|ethan|mason|logan|oliver|elijah|aiden|caleb|isaiah|andre|don|omar|diego)$/i;

  var SETTING_WORLD = [
    { re: /school|class(room)?|hallway|gym|cafeteria|campus|academy/, chips: ['no one goes past the third floor', 'every door locks at 3:00', 'students never walk alone', 'the bell decides everything', 'nobody talks about the old wing'] },
    { re: /house|home|attic|basement|apartment|bedroom|kitchen/, chips: ['nobody opens the attic', 'dinner is always silent', 'lights out at nine, no matter what', 'Grandma\'s room stays locked'] },
    { re: /library|museum/, chips: ['some books are chained shut', 'never touch the glass', 'silence at all times', 'the night guard sees everything'] },
    { re: /forest|woods|jungle|garden|park|field|farm/, chips: ['never leave the path', 'no fire after dark', 'the animals can talk to some people', 'nothing grows past the fence'] },
    { re: /city|town|village|street|neighborhood|mall/, chips: ['curfew at sunset', 'everyone is watched', 'the rich live up high', 'nobody crosses the river'] },
    { re: /space|ship|planet|moon|station|mars|rocket/, chips: ['oxygen is rationed', 'the captain\'s word is law', 'no one goes outside alone', 'Earth is only a story now'] },
    { re: /castle|kingdom|palace|tower|dungeon/, chips: ['magic is forbidden', 'only royals pass the gate', 'the king is never seen', 'every promise is binding'] },
    { re: /ocean|sea|beach|island|lake|river/, chips: ['no one swims past the buoys', 'the tide hides things', 'boats leave only at dawn'] }
  ];
  var GENERIC_WORLD = ['nobody talks about the past', 'kids make the rules', 'magic is forbidden', 'everything is watched', 'adults can\'t see what kids see'];

  /* ---------- topic library (inquiry + teacher mode) ---------- */
  var TOPICS = [
    { re: /ecosystem|food (web|chain)|habitats?\b|biome/, label: 'ecosystems', chips: {
      character: ['organisms', 'producers & consumers', 'predators and prey'],
      goal: ['survive and reproduce', 'find food and shelter', 'stay in balance'],
      obstacle: ['limited resources', 'environmental change', 'competition'],
      stakes: ['population changes', 'the food web collapses', 'the whole ecosystem shifts'],
      perspective: ['predator', 'prey', 'humans', 'the ecosystem itself'],
      world: ['habitat', 'a pond', 'a rainforest'],
      twist: ['one environmental variable changes', 'a new species arrives', 'a drought hits'] } },
    { re: /volcan|lava|magma|erupt/, label: 'volcanoes', chips: {
      character: ['magma', 'the people who live nearby', 'tectonic plates'],
      goal: ['pressure wants to escape', 'stay safe', 'predict the eruption'],
      obstacle: ['solid rock on top', 'no warning signs', 'people won\'t leave'],
      stakes: ['towns are destroyed', 'new land is made', 'the climate changes'],
      perspective: ['a scientist', 'a farmer on the slope', 'the volcano'],
      world: ['the Ring of Fire', 'deep underground', 'an island'],
      twist: ['the ash makes soil rich', 'it\'s been asleep for 1,000 years', 'it\'s under the ocean'] } },
    { re: /water cycle|evaporat|condensat|precipitat|rain/, label: 'the water cycle', chips: {
      character: ['a water droplet', 'the sun', 'clouds'],
      goal: ['get back to the ocean', 'rise into the sky', 'keep moving'],
      obstacle: ['cold air', 'getting trapped in ice', 'pollution'],
      stakes: ['droughts', 'floods', 'no fresh water'],
      perspective: ['a droplet', 'a farmer', 'a fish'],
      world: ['ocean to sky to land', 'a desert', 'a mountain'],
      twist: ['the same water dinosaurs drank', 'it freezes for 10,000 years', 'the sun stops for a day'] } },
    { re: /photosynth|plants?\b|leaf|leaves|chlorophyll/, label: 'photosynthesis', chips: {
      character: ['a plant', 'a leaf', 'sunlight'],
      goal: ['make its own food', 'grow toward light', 'survive winter'],
      obstacle: ['not enough light', 'no water', 'too much shade'],
      stakes: ['no oxygen for animals', 'the plant dies', 'the food chain breaks'],
      perspective: ['the plant', 'an animal that eats it', 'a gardener'],
      world: ['a sunny field', 'a dark forest floor', 'a windowsill'],
      twist: ['light is blocked for a week', 'it\'s moved to Mars', 'it only gets red light'] } },
    { re: /revolution|1776|colon(y|ies|ists)|independence|founding fathers/, label: 'the American Revolution', chips: {
      character: ['colonists', 'the British king', 'enslaved people'],
      goal: ['self-government', 'keep control', 'freedom'],
      obstacle: ['the British army', 'divided colonies', 'no money'],
      stakes: ['a new nation', 'punishment for treason', 'who gets freedom'],
      perspective: ['a loyalist', 'a patriot', 'an enslaved person', 'a Native nation'],
      world: ['the 13 colonies', 'Boston, 1773', 'a town split in two'],
      twist: ['France joins in', '"all men" didn\'t mean everyone', 'many colonists stayed loyal'] } },
    { re: /climate|global warming|carbon|greenhouse/, label: 'climate change', chips: {
      character: ['people', 'animals', 'the planet'],
      goal: ['stay livable', 'adapt', 'cut pollution'],
      obstacle: ['habits are hard to change', 'cost', 'people disagree'],
      stakes: ['rising seas', 'lost species', 'my future'],
      perspective: ['a farmer', 'a polar bear', 'a factory worker', 'a kid in 2075'],
      world: ['Earth\'s atmosphere', 'a coastal city', 'the Arctic'],
      twist: ['small changes add up', 'a solution creates a new problem', 'the ocean was hiding the heat'] } },
    { re: /fraction|decimal|percent|ratio/, label: 'fractions', chips: {
      character: ['the whole', 'the parts', 'a pizza'],
      goal: ['share fairly', 'compare sizes', 'put pieces back together'],
      obstacle: ['pieces aren\'t the same size', 'different denominators', 'it looks smaller but isn\'t'],
      stakes: ['someone gets less', 'the recipe fails', 'the answer is wrong'],
      perspective: ['the person sharing', 'the one getting the smallest slice', 'a baker'],
      world: ['a kitchen', 'a party', 'a number line'],
      twist: ['1/2 and 2/4 are the same', 'the whole gets bigger', 'one piece is missing'] } },
    { re: /solar system|planets?\b|moon|stars?\b|outer space|galaxy|gravity/, label: 'the solar system', chips: {
      character: ['the sun', 'the planets', 'gravity'],
      goal: ['stay in orbit', 'hold everything together', 'explore'],
      obstacle: ['huge distances', 'no air', 'extreme temperatures'],
      stakes: ['life on Earth', 'a planet flies off', 'astronauts\' safety'],
      perspective: ['an astronaut', 'the Moon', 'a kid on Earth'],
      world: ['the solar system', 'Mars', 'deep space'],
      twist: ['Pluto stopped being a planet', 'gravity turns off', 'Earth has a second moon'] } },
    { re: /civil rights|segregation|rosa parks|martin luther|mlk|equality|protest/, label: 'civil rights', chips: {
      character: ['activists', 'students', 'lawmakers'],
      goal: ['equal rights', 'change unfair laws', 'be treated with dignity'],
      obstacle: ['unfair laws', 'violence', 'fear'],
      stakes: ['justice', 'safety', 'the next generation'],
      perspective: ['a student protester', 'a bystander', 'a judge'],
      world: ['the 1950s–60s South', 'a bus', 'a lunch counter'],
      twist: ['young people led it', 'one small act sparked it', 'the fight isn\'t over'] } }
  ];
  function findTopic(text) { var t = text.toLowerCase(); for (var i = 0; i < TOPICS.length; i++) if (TOPICS[i].re.test(t)) return TOPICS[i]; return null; }

  /* ---------- analysis ---------- */
  function pronounsFor(head, plural) {
    if (plural) return { s: 'they', o: 'them', p: 'their', g: 'n', pl: true };
    if (FEMALE.test(head)) return { s: 'she', o: 'her', p: 'her', g: 'f' };
    if (MALE.test(head)) return { s: 'he', o: 'him', p: 'his', g: 'm' };
    if (NONHUMAN.test(head)) return { s: 'it', o: 'it', p: 'its', g: 'x' };
    return { s: 'they', o: 'them', p: 'their', g: 'n', pl: true };
  }

  function parseStory(text) {
    var words = stripEnd(text).split(' ');
    var lw = words.map(function (w) { return w.toLowerCase().replace(/[^a-z'’-]/g, ''); });
    var vi = -1;
    for (var i = 1; i < Math.min(lw.length, 7); i++) { if (VERBS[lw[i]]) { vi = i; break; } }
    if (vi < 1) return null;
    var subjWords = words.slice(0, vi), subjLower = lw.slice(0, vi);
    var rel = -1; for (var ri = 1; ri < subjLower.length; ri++) if (/^(who|that|which|whose)$/.test(subjLower[ri])) { rel = ri; break; }
    var relClause = false;
    if (rel > 0) { subjWords = subjWords.slice(0, rel); subjLower = subjLower.slice(0, rel); relClause = true; }
    var name = null;
    if (!ARTICLES[subjLower[0]] && /^[A-Z]/.test(subjWords[0]) && subjLower[0] !== 'i') {
      name = subjWords.filter(function (w) { return /^[A-Z]/.test(w); }).slice(0, 2).join(' ').replace(/[^A-Za-z' -]/g, '');
    }
    var head = subjLower[subjLower.length - 1];
    var plural = !name && (NUMBERS[subjLower[0]] || (/[^s]s$/.test(head) && !/^(bus|boss|princess|actress|class|glass)$/.test(head)));
    var first = name ? name.split(' ')[0] : '';
    var pr = name ? (F_NAMES.test(first) ? pronounsFor('girl') : M_NAMES.test(first) ? pronounsFor('boy') : { s: 'they', o: 'them', p: 'their', g: 'n', pl: true }) : pronounsFor(head, plural);
    var subjPhrase = name || ('the ' + subjWords.slice(ARTICLES[subjLower[0]] ? 1 : 0).join(' ').toLowerCase());
    if (!name && subjLower[0] === 'my') subjPhrase = 'your ' + subjWords.slice(1).join(' ').toLowerCase();

    // object after verb
    var j = vi + 1; while (j < lw.length && PARTICLES[lw[j]]) j++;
    var obj = null, objPhrase = null;
    if (!relClause && j < lw.length && !PREPS[lw[j]]) {
      var k = j; if (ARTICLES[lw[k]]) k++;
      var objWords = [];
      while (k < lw.length && !PREPS[lw[k]] && objWords.length < 4) { objWords.push(lw[k]); k++; }
      if (objWords.length) { obj = objWords[objWords.length - 1]; objPhrase = 'the ' + obj; }
    }
    // setting
    var setting = null;
    var sm = stripEnd(text).match(/\b(?:in|at|inside|on|near|under|behind|beneath|outside|into)\s+(?:her|his|their|the|a|an|my|our|its|this)?\s*([A-Za-z' ]+?)(?:\s+(?:and|but|where|when|while|that|who|with|after|before)\b|$)/i);
    var settingProper = false;
    if (sm) { var raw = sm[1].trim().split(' ').slice(-2); settingProper = /^[A-Z]/.test(raw[raw.length - 1]); setting = settingProper ? raw.join(' ') : raw.join(' ').toLowerCase(); if (/^(the|a)$/i.test(setting)) setting = null; }
    return { name: name, head: head, pr: pr, plural: !!plural, subjPhrase: subjPhrase, obj: obj, objPhrase: objPhrase, setting: setting, settingProper: settingProper, nonhuman: pr.g === 'x' };
  }

  // "a girl, a locked door and a journal": a list of story pieces, no verb yet
  function parseList(text) {
    var body = stripEnd(text).replace(/^(?:(?:so\s+)?(?:the|my)\s+(?:idea|story)\s+is\s+|it'?s\s+|it\s+is\s+|this\s+is\s+|a\s+story\s+)?(?:about|of)\s+/i, '');
    var parts = body.split(/\s*,\s*(?:and\s+)?|\s+and\s+|\s+with\s+|\s*\+\s*|\s*&\s*/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (parts.length < 2 || parts.length > 5) return null;
    var lists = parts.map(function (ph) { var w = ph.toLowerCase().replace(/[^a-z' -]/g, '').split(' ').filter(Boolean); return w; });
    if (lists.some(function (w) { return !w.length || w.length > 4 || w.some(function (x) { return VERBS[x]; }); })) return null;
    var ci = -1;
    for (var i = 0; i < lists.length; i++) { var h = lists[i][lists[i].length - 1]; if (FEMALE.test(h) || MALE.test(h) || NONHUMAN.test(h)) { ci = i; break; } }
    if (ci < 0) return null;
    var cw = lists[ci], head = cw[cw.length - 1], plural = /[^s]s$/.test(head) && !/^(princess|actress)$/.test(head);
    var rest = lists.filter(function (_, k) { return k !== ci; });
    var o = rest[0], obj = o[o.length - 1];
    var setting = null, sp = false;
    parts.forEach(function (ph, k) { if (k === ci || setting) return; var w = lists[k]; if (SETTING_WORLD.some(function (sw) { return sw.re.test(w[w.length - 1]); })) { var ow = ph.replace(/[^A-Za-z' -]/g, '').split(' ').filter(function (x) { return x && !ARTICLES[x.toLowerCase()] && !/^my$/i.test(x); }); sp = /^[A-Z]/.test(ow[ow.length - 1]) && k > 0; setting = sp ? ow.join(' ') : ow.join(' ').toLowerCase(); } });
    if (setting && rest.length > 1 && o.join(' ').indexOf(setting) >= 0) { o = rest[1]; obj = o[o.length - 1]; }
    return { name: null, head: head, pr: pronounsFor(head, plural), plural: plural, subjPhrase: 'the ' + cw.filter(function (x) { return !ARTICLES[x]; }).join(' '),
      obj: obj, objPhrase: 'the ' + obj, setting: setting, settingProper: sp, nonhuman: NONHUMAN.test(head), pieces: rest.map(function (w) { return w[w.length - 1]; }) };
  }

  var HARM = /\b(kill (myself|me)|suicid|self[- ]?harm|cut myself|want to die|end my life)\b/i;

  function analyze(raw) {
    var text = clean(raw);
    if (!text) return null;
    if (HARM.test(text)) return { mode: 'care', idea: text };
    var gm = text.match(/^(?:grade|gr\.?)\s*(k|\d{1,2})\b\s*[-—–:,.]*\s*(.+)$/i) ||
             text.match(/^(k|\d{1,2})(?:st|nd|rd|th)?\s*grade\b\s*[-—–:,.]*\s*(.+)$/i) ||
             text.match(/^(kindergarten)\s*[-—–:,.]*\s*(.+)$/i);
    if (gm) {
      var topicText = stripEnd(gm[2]);
      var tp = findTopic(topicText);
      return { mode: 'teacher', idea: text, grade: /^k/i.test(gm[1]) ? 'K' : gm[1], topic: topicText.toLowerCase(), lib: tp };
    }
    if (/^(i|i'm|im|i’ve|i've|ive|my|we|we're|our|me|how (do|can|should|could) (i|we)|should (i|we)|why (do|can't|cant|am) i)\b/i.test(text))
      return { mode: 'problem', idea: text, lib: findTopic(text) };
    var isQuestion = /\?$/.test(text) || /^(why|how|what|when|where|who|which|is|are|do|does|can|could|should|would|will)\b/i.test(text);
    if (!isQuestion) {
      var st = parseList(text) || parseStory(text);
      if (st) { st.mode = 'story'; st.idea = text; return st; }
    }
    var lib = findTopic(text);
    var topic;
    if (lib) topic = lib.label;
    else if (isQuestion) topic = 'this question';
    else topic = stripEnd(text).toLowerCase().replace(/^(a|an)\s+/, '');
    if (!isQuestion && topic.split(' ').length > 5) topic = 'this idea';
    return { mode: 'inquiry', idea: text, topic: topic, lib: lib, question: isQuestion };
  }

  /* ---------- names from answers ---------- */
  var NOT_NAMES = { I: 1, The: 1, A: 1, An: 1, She: 1, He: 1, They: 1, It: 1, Her: 1, His: 1, My: 1, Our: 1, This: 1, That: 1, Who: 1, Grade: 1, No: 1, Yes: 1 };
  var COMMON_NAMES = /^(maya|zuri|ava|nia|rosa|leo|eli|marcus|kai|theo|sam|jordan|river|pip|bolt|lily|emma|mia|noah|liam|zoe|jayden|aaliyah|sofia|lucas|amara|malik|luna|max)$/i;
  function nameFrom(answer) {
    var a = clean(answer);
    var m = a.match(/\b(?:named|called|name is)\s+([A-Za-z][a-z'-]+)/i);
    if (m) return cap(m[1]);
    var w = a.split(' ');
    for (var i = 0; i < w.length; i++) { var t = w[i].replace(/[^A-Za-z'-]/g, ''); if (/^[A-Z][a-z'-]+$/.test(t) && !NOT_NAMES[t]) return t; }
    if (w.length <= 2 && COMMON_NAMES.test(w[0].replace(/[^A-Za-z]/g, ''))) return cap(w[0].replace(/[^A-Za-z]/g, ''));
    return null;
  }

  /* ---------- question + chip builders ---------- */
  var WHY = {
    character: 'Every idea starts with who.',
    goal: 'Wanting something gives your idea direction.',
    obstacle: 'What stands in the way is what makes it interesting.',
    stakes: 'Stakes are why anyone should care.',
    perspective: 'Who sees it changes what it means.',
    world: 'Every place has rules, even unspoken ones.',
    twist: 'A twist changes what we thought we knew.'
  };
  var WHY_TEACHER = {
    character: 'Every concept has actors. Naming them gives students someone to follow.',
    goal: 'A goal turns facts into a purpose students can reason about.',
    obstacle: 'Constraints are where the real thinking happens.',
    stakes: 'Stakes make the content matter to a 9-year-old.',
    perspective: 'Switching viewpoints builds evidence-based reasoning.',
    world: 'Context sets the rules the concept obeys.',
    twist: 'Changing one variable turns knowing into inquiry.'
  };

  function storyRefs(ctx, answers) {
    var pr = ctx.pr, name = ctx.name || (answers.character && nameFrom(answers.character.text));
    if (name && !ctx.name && pr.pl && !ctx.plural) pr = F_NAMES.test(name) ? pronounsFor('girl') : M_NAMES.test(name) ? pronounsFor('boy') : pr;
    // a creature the learner has named becomes a someone: "Rivet thinks they know", not "it knows"
    if (name && !ctx.name && pr.g === 'x' && !ctx.plural) pr = F_NAMES.test(name) ? pronounsFor('girl') : M_NAMES.test(name) ? pronounsFor('boy') : pronounsFor('', true);
    if (name && ctx.plural) name = null; // a group keeps "they"

    var pl = !name && pr.pl;
    return {
      S: name || (pr.g === 'x' && ctx.subjPhrase) || pr.s, O: name || (pr.g === 'x' && ctx.subjPhrase) || pr.o, P: name ? name + '\u2019s' : pr.p, pr: pr,
      s: pr.s, o: pr.o, p: pr.p, name: name,
      v: function (sing, plur) { return pl ? plur : sing; },
      v2: function (sing, plur) { return pr.pl ? plur : sing; } // for the pronoun that follows a name
    };
  }

  function questionFor(ctx, lensId, answers) {
    answers = answers || {};
    var seed = hash(ctx.idea + lensId);
    var q, chips, why = WHY[lensId], hint = null;
    var A = function (id) { return answers[id] ? stripEnd(answers[id].text) : null; };

    if (ctx.mode === 'story') {
      var r = storyRefs(ctx, answers), obj = ctx.obj, op = ctx.objPhrase, door = obj && DOORLIKE.test(obj);
      var does = r.v('does', 'do'), is = r.v('is', 'are'), has = r.v('has', 'have');
      var s = r.pr.s, o = r.pr.o, p = r.pr.p;
      var is2 = r.v2('is', 'are'), has2 = r.v2('has', 'have'), s2 = r.v2('s', '');
      switch (lensId) {
        case 'character':
          if (ctx.name) { q = 'Who is ' + ctx.name + '?'; hint = 'One word about ' + ctx.name + ' is enough.'; }
          else { q = 'Who ' + (ctx.pr.pl ? 'are' : 'is') + ' ' + (ctx.pr.g === 'x' ? ctx.subjPhrase : ctx.pr.s) + '?'; hint = 'Give ' + (ctx.pr.g === 'x' ? 'it' : ctx.pr.o) + ' a name, or one word that describes ' + (ctx.pr.g === 'x' ? 'it' : ctx.pr.o) + '.'; }
          var names = ctx.nonhuman ? ['Bolt', 'Pip', 'Juniper', 'Rivet', 'Moss'] : ctx.pr.g === 'f' ? ['Maya', 'Zuri', 'Ava', 'Nia', 'Rosa'] : ctx.pr.g === 'm' ? ['Leo', 'Eli', 'Marcus', 'Kai', 'Theo'] : ['Sam', 'Jordan', 'River', 'Amara', 'Malik'];
          var traits = ctx.plural ? ['twins who never agree', 'always competing', 'the new kids in town', 'best friends since forever', 'brave together, scared alone'] : ctx.nonhuman ? ['the last of ' + p + ' kind', 'built to follow orders', 'smaller than everyone else', 'older than anyone knows']
            : ['the new kid', 'the one who never breaks rules', 'too curious for ' + p + ' own good', 'quiet, but notices everything', 'brave, but afraid of the dark'];
          if (ctx.plural) names = ['Jordan and Eli', 'Zuri and Kai', 'the Rivera twins'];
          chips = ctx.name ? pick(traits, 3, seed) : pick(names, 1, seed).concat(pick(traits, 2, seed + 7));
          break;
        case 'goal':
          if (obj && GOAL_VERB[obj]) q = 'Why ' + does + ' ' + r.S + ' need ' + op + ' ' + GOAL_VERB[obj] + '?';
          else if (obj && GOAL_INF[obj]) q = 'Why ' + does + ' ' + r.S + ' need to ' + GOAL_INF[obj] + ' ' + op + '?';
          else if (obj) q = 'Why ' + does + ' ' + op + ' matter to ' + r.O + '?';
          else q = 'What ' + does + ' ' + r.S + ' want more than anything?';
          chips = door ? ['someone is trapped inside', s + ' heard ' + p + ' name behind it', p + ' best friend went in and never came out', 'it\u2019s the only way home', 'something inside belongs to ' + o]
            : obj ? ['it reminds ' + o + ' of someone', 'it could change everything', 'nobody else believes in it', 'it might be the way home']
            : ['to find someone ' + s + ' lost', 'to be believed', 'to get home', 'to prove ' + s + ' can'];
          chips = pick(chips, 3, seed);
          break;
        case 'obstacle':
          q = 'What stops ' + r.O + '?';
          chips = door ? ['there\u2019s no key', 'a teacher who says no', s + ' ' + is2 + ' afraid of what\u2019s behind it', p + ' best friend won\u2019t help', 'time is running out']
            : ['nobody believes ' + o, 'time is running out', 'someone wants the same thing', s + ' ' + is2 + ' scared', 'a rule ' + s + ' can\u2019t break'];
          chips = pick(chips, 3, seed);
          break;
        case 'stakes':
          q = 'What happens if ' + r.S + ' walk' + r.v('s', '') + ' away' + (obj ? (door ? '' : ' from ' + op) : '') + '?';
          chips = pick([door ? 'someone stays trapped' : 'someone gets left behind', s + ' never learn' + s2 + ' the truth', 'someone else gets blamed',
            s + ' lose' + s2 + ' ' + p + ' only chance', (ctx.settingProper ? 'all of ' + ctx.setting + ' changes' : 'the whole ' + (ctx.setting || 'world') + ' changes')], 3, seed);
          break;
        case 'perspective':
          q = 'What might ' + r.S + ' misunderstand?';
          chips = door ? ['who locked it', 'why it\u2019s locked', 'who ' + s + ' can trust', 'what the adults already know']
            : ['who ' + s + ' can trust', 'what ' + s + ' really want' + s2, 'what everyone else already knows', 'why it\u2019s happening'];
          chips = pick(chips, 3, seed);
          break;
        case 'world':
          if (ctx.setting) q = 'What rules does ' + (ctx.settingProper ? '' : 'this ') + ctx.setting + ' have?';
          else q = 'What rules does ' + r.P + ' world have?';
          var pool = GENERIC_WORLD;
          for (var i = 0; i < SETTING_WORLD.length; i++) if (ctx.setting && SETTING_WORLD[i].re.test(ctx.setting.toLowerCase())) { pool = SETTING_WORLD[i].chips; break; }
          chips = pick(pool, 3, seed);
          break;
        case 'twist':
          q = 'What changes what ' + r.S + ' think' + r.v('s', '') + ' ' + (r.name ? s : '') + (r.name ? ' ' : '') + (r.name ? 'know' + s2 : (s + ' know' + r.v('s', ''))) + '?';
          q = q.replace(/\s+/g, ' ');
          chips = door ? ['it was locked from the inside', p + ' own name is on the door', s + ' ' + has2 + ' been here before', 'someone was waiting for ' + o, 'the one stopping ' + o + ' was protecting ' + o]
            : [s + ' ' + has2 + ' been here before', 'the enemy was trying to help', 'it was all a test', 'someone was waiting for ' + o];
          chips = pick(chips, 3, seed);
          break;
      }
      // personalize from earlier answers
      // echo the learner's own words back only when they fit whole: tidied, never cut mid-phrase
      var echo = function (id) { var t = answers[id] && tidy(answers[id].text, r.name ? (function (k) { k[r.name] = 1; return k; })({}) : null); return t && t.split(' ').length <= 10 && t.length <= 64 ? t : null; };
      if (lensId === 'stakes' && A('goal')) hint = echo('goal') ? 'Your goal so far: \u201C' + echo('goal') + '.\u201D What would losing it cost?' : 'Look back at the goal you set. What would losing it cost?';
      if (lensId === 'perspective' && A('obstacle')) hint = echo('obstacle') ? 'Think about your obstacle: \u201C' + echo('obstacle') + '.\u201D Is it really what it seems?' : 'Think about the obstacle you named. Is it really what it seems?';
      if (lensId === 'twist' && A('perspective')) hint = echo('perspective') ? 'You said ' + r.S + ' might misunderstand: \u201C' + echo('perspective') + '.\u201D' : 'Think about what ' + r.S + ' might have misunderstood.';
    }

    else if (ctx.mode === 'teacher') {
      var t = ctx.topic, c = A('character');
      var lib = ctx.lib;
      why = WHY_TEACHER[lensId];
      var Q = {
        character: 'Who are the \u201Ccharacters\u201D in ' + t + '?',
        goal: 'What are ' + (c || 'they') + ' trying to do?',
        obstacle: 'What stands in ' + (c ? 'the way of ' + c : 'their way') + '?',
        stakes: 'What\u2019s at stake if ' + (c || 'they') + ' fail?',
        perspective: 'Whose point of view could students take?',
        world: 'What is the \u201Cworld\u201D of ' + t + '?',
        twist: 'What one change could students test?'
      };
      q = Q[lensId];
      var G = { character: ['the key living things', 'the people involved', 'the main forces'], goal: ['survive', 'stay in balance', 'change something'],
        obstacle: ['limited resources', 'change over time', 'competition'], stakes: ['what students care about changes', 'a system breaks down', 'people are affected'],
        perspective: ['someone inside it', 'someone affected by it', 'an outside observer'], world: ['where it happens', 'when it happens', 'the conditions it needs'],
        twist: ['one variable changes', 'a new actor arrives', 'an assumption turns out wrong'] };
      chips = lib ? lib.chips[lensId].slice(0, lensId === 'perspective' ? 4 : 3) : G[lensId];
      if (lensId === 'character') hint = 'Grade ' + ctx.grade + '. Turning content into characters gives students someone to follow.';
    }

    else if (ctx.mode === 'problem') {
      var PQ = {
        character: 'Who\u2019s part of this, besides you?', goal: 'What would \u201Csolved\u201D look like?', obstacle: 'What gets in the way most?',
        stakes: 'What happens if nothing changes?', perspective: 'How might someone else see this?', world: 'When and where does it usually happen?',
        twist: 'What if the real problem is something else?' };
      var PC = { character: ['just me', 'a friend', 'my family', 'a teacher'], goal: ['I feel calmer', 'it\u2019s finished on time', 'we\u2019re talking again'],
        obstacle: ['my phone', 'I don\u2019t know where to start', 'feeling tired', 'I\u2019m afraid to mess up'], stakes: ['it gets bigger', 'I miss out', 'someone gets hurt'],
        perspective: ['my best friend', 'my teacher', 'future me', 'someone who\u2019s been there'], world: ['late at night', 'at home', 'at school'],
        twist: ['I\u2019m bored, not lazy', 'the first step is too big', 'I\u2019m waiting for permission', 'it\u2019s not about me'] };
      var lowI = ctx.idea.toLowerCase();
      if (/homework|procrastinat|study|test|exam|grade|assignment|project|essay|focus/.test(lowI)) {
        PC.goal = ['it\u2019s done before dinner', 'I start without stressing', 'I actually understand it', 'my grades go up'];
        PC.stakes = ['I fall further behind', 'I stay stressed', 'I lose free time'];
        PC.twist = ['I\u2019m bored, not lazy', 'the first step is too big', 'I\u2019m afraid to get it wrong', 'I work better with someone'];
      } else if (/friend|fight|argu|mad at|bull|lonely|left out|sister|brother|mom|dad|parent/.test(lowI)) {
        PC.character = ['my friend', 'my family', 'the whole group', 'someone I barely know'];
        PC.goal = ['we\u2019re talking again', 'I feel included', 'everyone feels heard'];
        PC.obstacle = ['nobody wants to go first', 'I\u2019m still upset', 'other people keep taking sides'];
        PC.twist = ['they feel left out too', 'it\u2019s about something else', 'I hurt them first without knowing'];
      }
      q = PQ[lensId]; chips = pick(PC[lensId], 3, seed);
    }

    else { // inquiry: topic or question
      var T = ctx.topic, ch = A('character'), L = ctx.lib;
      var IQ = {
        character: 'Who or what is at the center of ' + T + '?',
        goal: ch ? 'What is ' + ch + ' trying to do?' : 'What is the goal here?',
        obstacle: ch ? 'What stops ' + ch + '?' : 'What gets in the way?',
        stakes: 'Why does it matter? What happens if it goes wrong?',
        perspective: 'Who might see ' + (T === 'this question' ? 'this' : T) + ' completely differently?',
        world: 'Where does this happen, and what are the rules there?',
        twist: 'What if one thing changed? What would it be?' };
      var IC = { character: ['the people involved', 'something in nature', 'a force no one can see'], goal: ['to survive', 'to change something', 'to find balance'],
        obstacle: ['not enough resources', 'people disagree', 'something keeps changing'], stakes: ['people get hurt', 'something is lost forever', 'the future changes'],
        perspective: ['someone who benefits', 'someone who loses', 'someone far away'], world: ['right here, right now', 'long ago', 'a place with strict rules'],
        twist: ['one key fact is wrong', 'the small thing matters most', 'the \u201Cvillain\u201D had a reason'] };
      q = IQ[lensId];
      chips = L ? pick(L.chips[lensId], 3, seed) : pick(IC[lensId], 3, seed);
      if (lensId === 'stakes') q = 'What happens if it goes wrong?';
    }
    return { lens: lensId, question: q, hint: hint, why: why, chips: chips };
  }

  /* ---------- re-centering: same answers, new questions ---------- */
  /* ---------- reframing: one viewing lens x one answered lens ----------
     Every (viewing lens, answered lens) pair has its own question, so no two rows in a view share a frame.
     Learner answers are never truncated or pasted in raw: we tidy them (filler, stray caps) for display,
     and weave in only a clean key noun ("the secrets", "the key") or the story's own people, places and objects. */
  var FILLER = /^(hey|hi|um+|uh+|so|well|like|ok|okay|maybe|i think|i guess|idk|probably|basically)\b[,\s]*/i;
  var COMMON = {};
  ('a an the and or but if then so to of in on at by for from with without into onto over under about after before is are was were be been being am ' +
   'it its it\'s she he they them their her his him we us our you your i me my mine this that these those there here what who whom whose which when where why how ' +
   'not no yes all any some someone something somebody anyone everyone nobody nothing else other another own same very really just only also too still even ' +
   'may might will would can could should must shall do does did done has have had having get gets got make makes made know knows knew think thinks thought ' +
   'want wants wanted need needs needed belong belongs belonged find finds found keep keeps kept hold holds held hide hides hid lose loses lost open opens ' +
   'locked lock key keys door doors secret secrets journal book box friend friends whole time way thing things stuff lot more most less much many important')
    .split(' ').forEach(function (w) { COMMON[w] = 1; });
  var STOPK = {};
  ('a an the and or but if then so to of in on at by for from with without into onto over under about after before is are was were be been being am it its it\'s ' +
   'she he they them their her his him we us our you your i me my this that these those there here what who whom whose which when where why how not no yes all any ' +
   'some someone something somebody anyone everyone nobody nothing else other another own same very really just only also too still even may might will would can ' +
   'could should must do does did done has have had get gets got make makes made know knows knew think thinks want wants need needs belong belongs whole time way ' +
   'thing things stuff lot more most less much many always never ever been being hey um uh like okay ok maybe already again around first last next else everyone everything')
    .split(' ').forEach(function (w) { STOPK[w] = 1; });

  // Light cleanup for display: trim, drop leading filler, fix stray mid-sentence caps, sentence case, no trailing punctuation.
  function tidy(text, keep) {
    var s = stripEnd(text), prev;
    do { prev = s; s = s.replace(FILLER, ''); } while (s !== prev && s);
    if (!s) s = stripEnd(text);
    var words = s.split(' ').map(function (w, i) {
      var bare = w.replace(/[^A-Za-z']/g, ''), low = bare.toLowerCase();
      if (i > 0 && /^[A-Z]/.test(bare) && bare !== 'I' && !(keep && keep[bare]) && (COMMON[low] || VERBS[low] || /^[A-Z]+$/.test(bare) && bare.length > 1 && COMMON[low])) return w.toLowerCase();
      if (i > 0 && /^[A-Z]{2,}$/.test(bare) && COMMON[low]) return w.toLowerCase();
      return w;
    });
    return cap(words.join(' '));
  }
  // The answer's key noun, if we can find one cleanly: "Hey holes very important secrets" -> "the secrets".
  function keyNoun(text) {
    var w = stripEnd(text).toLowerCase().replace(/[^a-z' -]/g, ' ').split(/\s+/).filter(Boolean);
    for (var i = w.length - 1; i >= 0; i--) {
      var t = w[i];
      if (t.length < 3 || STOPK[t] || VERBS[t] || /(ly|ing|ed)$/.test(t) && t.length > 4) continue;
      return { np: 'the ' + t, pl: /[^s]s$/.test(t) };
    }
    return null;
  }
  function placeOf(ctx) {
    var s = ctx.setting;
    if (!s) return null;
    if (ctx.settingProper || /^(the|a|an|her|his|their|my|our|its)\s/i.test(s)) return s.replace(/^(a|an)\s/i, 'the ');
    return 'the ' + s;
  }
  var REFL = { f: 'herself', m: 'himself', x: 'itself', n: 'themselves' };

  function reframe(ctx, centerLens, otherId, answerText, answers) {
    answers = answers || {};
    if (otherId !== 'idea' && !answerText) return null;
    if (ctx.mode === 'story') return storyReframe(ctx, centerLens, otherId, answers);
    var T = ctx.topic || (ctx.mode === 'problem' ? 'this' : 'this idea');
    var ch = answers.character ? keyNoun(answers.character.text) : null;
    var chT = answers.character ? tidy(answers.character.text) : '';
    var who = chT && chT.split(' ').length <= 4 ? (/^[A-Z][a-z]+\s/.test(chT) || chT.split(' ').length === 1 && !/^[A-Z][a-z]+$/.test(chT) ? chT.charAt(0).toLowerCase() + chT.slice(1) : chT.split(' ').length === 1 ? chT.toLowerCase() : chT.charAt(0).toLowerCase() + chT.slice(1)) : ch ? ch.np : 'the people involved';
    var G = {
      twist: { idea: 'What if the opposite were true about ' + T + '?', character: 'What hidden side of ' + who + ' would surprise people?', goal: 'Could the real goal be something nobody has named yet?',
        obstacle: 'When does the obstacle turn out to be useful?', stakes: 'Is the biggest risk really the obvious one?', perspective: 'Whose unexpected viewpoint might turn out to be right?',
        world: 'How would all of this change somewhere completely different?' },
      perspective: { idea: 'Who sees ' + T + ' completely differently than you do?', character: 'How would ' + who + ' explain this in their own words?', goal: 'Who would want the opposite outcome?',
        obstacle: 'Who might see the obstacle as a good thing?', stakes: 'Who feels the consequences first?', world: 'Who made the rules here, and who do they protect?', twist: 'Who saw the twist coming?' },
      stakes: { idea: 'Why does ' + T + ' matter to you?', character: 'Who has the most to lose here?', goal: 'What happens if the goal is never reached?', obstacle: 'What does it cost to get past the obstacle?',
        perspective: 'Whose loss gets overlooked?', world: 'What in this setting could change for good?', twist: 'What does the twist put at risk?' },
      world: { idea: 'How would ' + T + ' change somewhere else?', character: 'How does the setting shape ' + who + '?', goal: 'What in this world makes the goal possible?', obstacle: 'Is the obstacle built into the setting?',
        stakes: 'Where would the effects show up first?', perspective: 'Where would someone see this differently?', twist: 'What about the setting makes the twist possible?' },
      character: { idea: 'Who does ' + T + ' belong to?', goal: 'Who wants this most, and why?', obstacle: 'Who is affected most by the obstacle?', stakes: 'Who cares the most about what happens?',
        perspective: 'How does each viewpoint change who matters?', world: 'Who lives with these rules every day?', twist: 'Who changes most because of the twist?' },
      goal: { idea: 'What is ' + T + ' trying to do?', character: 'What does ' + who + ' need most?', obstacle: 'How does the obstacle change the goal?', stakes: 'Is the goal worth the risk?',
        perspective: 'Does everyone want the same outcome?', world: 'What does this setting make people want?', twist: 'Does the twist change the goal?' },
      obstacle: { idea: 'What makes ' + T + ' hard?', character: 'What gets in the way for ' + who + '?', goal: 'What has to be overcome to reach the goal?', stakes: 'What makes the risk hard to face?',
        perspective: 'What looks like an obstacle from one side but not the other?', world: 'What in the setting creates the obstacle?', twist: 'What new problem does the twist create?' }
    };
    return (G[centerLens] || {})[otherId] || null;
  }

  function storyReframe(ctx, centerLens, otherId, answers) {
    var r = storyRefs(ctx, answers), N = r.name || ctx.subjPhrase || r.s;
    var s = r.s, o = r.o, p = r.p, pl2 = !!r.pr.pl, refl = REFL[r.pr.g] || 'themselves';
    var isN = r.v('is', 'are'), getsN = r.v('gets', 'get');
    var sIs = s + (pl2 ? '\u2019re' : '\u2019s');
    var OBJ = ctx.objPhrase ? ctx.objPhrase.replace(/^(a|an)\s/i, 'the ') : null;
    if (OBJ && ctx.obj) { var adj = ctx.idea.match(new RegExp('\\b(locked|hidden|secret|old|strange|glowing|broken|forgotten|mysterious|tiny|giant|magic|empty|lost)\\s+' + ctx.obj + '\\b', 'i')); if (adj && OBJ.indexOf(adj[1].toLowerCase()) < 0) OBJ = 'the ' + adj[1].toLowerCase() + ' ' + ctx.obj; }
    var kp = answers.perspective ? keyNoun(answers.perspective.text) : null;
    var PLACE = placeOf(ctx) || 'this world', PLACEin = placeOf(ctx) || 'this world';
    var kg = answers.goal ? keyNoun(answers.goal.text) : null; if (kg && !kg.pl) kg = null;
    var door = ctx.obj && DOORLIKE.test(ctx.obj), locked = /lock/i.test(ctx.idea + ' ' + (answers.obstacle ? answers.obstacle.text : ''));
    var friend = r.name ? 'How would ' + N + '\u2019s best friend describe ' + o + ' right now?' : 'How would someone close to ' + N + ' describe ' + o + ' right now?';
    var T = {
      twist: {
        idea: 'Suppose ' + N + ' ' + r.v('isn\u2019t', 'aren\u2019t') + ' the first to find ' + (OBJ || 'this') + '. Who was?',
        character: 'What secret could ' + N + ' be keeping, even from ' + refl + '?',
        goal: kg ? 'Could ' + kg.np + ' ' + sIs + ' chasing turn out to be about ' + o + '?' : 'Could getting what ' + s + ' ' + r.v2('wants', 'want') + ' be the worst thing that could happen?',
        obstacle: OBJ && (door || locked) ? 'What if ' + OBJ + ' was never meant to keep ' + o + ' out?' : 'What if the thing in ' + p + ' way is secretly protecting ' + o + '?',
        stakes: 'Is what ' + N + ' ' + r.v('fears', 'fear') + ' losing the very thing holding ' + o + ' back?',
        perspective: kp && kp.np !== OBJ ? (kp.pl ? 'Were ' : 'Was ') + kp.np + ' meant for ' + N + ' all along?' : 'Has the one who sees it differently been right all along?',
        world: 'What has ' + PLACE + ' been hiding on purpose?' },
      perspective: {
        idea: 'Whose story is this, if ' + N + ' ' + r.v('isn\u2019t', 'aren\u2019t') + ' the one telling it?',
        character: friend,
        goal: 'Who would want ' + N + ' to fail, and why?',
        obstacle: door ? 'Who ' + (locked ? 'locked ' : 'closed ') + 'the ' + ctx.obj + ', and what were they protecting?' : 'Who made this hard for ' + N + ' on purpose, and what were they protecting?',
        stakes: 'Who else gets hurt if ' + N + ' ' + r.v('fails', 'fail') + '?',
        world: 'What does ' + PLACE + ' look like to someone who doesn\u2019t belong there?',
        twist: 'Who already knew the truth before ' + N + ' did?' },
      stakes: {
        idea: 'Why does this story need to be told now?',
        character: 'What would ' + N + ' never forgive ' + refl + ' for?',
        goal: 'What happens to ' + N + ' if ' + s + ' never ' + r.v2('gets', 'get') + ' ' + (kg ? kg.np : 'what ' + s + ' ' + r.v2('wants', 'want')) + '?',
        obstacle: 'What will ' + N + ' risk to get past it?',
        perspective: 'Who pays the price if nobody listens to the other side?',
        world: 'What could ' + PLACE + ' lose because of this?',
        twist: 'When the truth comes out, who has the most to lose?' },
      world: {
        idea: 'Could this story happen anywhere else, or only here?',
        character: 'What does ' + PLACE + ' expect ' + N + ' to be?',
        goal: 'What rule in ' + PLACEin + ' makes ' + p + ' goal hard to reach?',
        obstacle: 'Is the obstacle part of ' + PLACE + ' itself?',
        stakes: 'Who in ' + PLACEin + ' would notice if things go wrong?',
        perspective: 'Where in ' + PLACEin + ' would someone see this completely differently?',
        twist: 'What would ' + PLACE + ' have to hide for this twist to work?' },
      character: {
        idea: 'Who does this story really belong to?',
        goal: 'What does wanting this say about who ' + N + ' ' + isN + '?',
        obstacle: 'What does this obstacle reveal about ' + N + '?',
        stakes: 'Why does ' + N + ' care so much?',
        perspective: 'How does the other side change how ' + N + ' ' + r.v('sees', 'see') + ' ' + refl + '?',
        world: 'How did ' + PLACE + ' make ' + N + ' who ' + s + ' ' + r.v2('is', 'are') + '?',
        twist: 'Who is ' + N + ' after the twist?' },
      goal: {
        idea: 'What is this story really reaching for?',
        character: 'What does ' + N + ' want that ' + s + ' won\u2019t say out loud?',
        obstacle: 'Does the obstacle change what ' + N + ' really ' + r.v('wants', 'want') + '?',
        stakes: 'Is the goal worth the risk?',
        perspective: 'Does the other side want the same thing?',
        world: 'What does ' + PLACE + ' reward people for wanting?',
        twist: 'After the twist, does ' + N + ' still want the same thing?' },
      obstacle: {
        idea: 'What\u2019s the hardest part of this story to solve?',
        character: 'How could ' + N + ' be ' + p + ' own obstacle?',
        goal: 'What will ' + N + ' have to give up to get there?',
        stakes: 'What makes ' + N + ' want to give up?',
        perspective: 'What if the obstacle looks like help from the other side?',
        world: 'What in ' + PLACEin + ' works against ' + N + '?',
        twist: 'What new problem does the twist create?' }
    };
    var q = (T[centerLens] || {})[otherId];
    return q ? cap(q) : null;
  }

  /* ---------- the payoff: assemble the learner's own answers ----------
     Learner words are passed through whole (trim, filler, stray caps, sentence case only).
     STORIGEN adds fixed connective words and nothing else: no invented characters, places or events. */
  var CLAUSE = /\b(is|are|was|were|am|be|been|has|have|had|can|can't|cannot|could|will|won't|would|should|must|may|might|does|doesn't|did|didn't|do|don't|isn't|aren't|wasn't|gets|got|loses|lost|finds|found|knows|knew|belongs|wants|needs|sees|saw|thinks|turns|happens|changes|becomes|runs|goes|comes|keeps|hides|stops|breaks|falls|grows|lives|dies|leaves|works|helps|matters|means)\b|'s\b|\u2019s\b|\b(she|he|they|i|we|it|everyone|everything|nobody|no one|someone|nothing)\s+\w+/i;
  var GOALVERB = /^(find|open|get|save|escape|go|win|learn|know|discover|prove|protect|keep|stop|help|fix|make|reach|return|see|meet|solve|finish|unlock|understand|become|be|bring|grow|build|leave|free|tell|hide|show|stay|change|catch|take|give|read|write)\b/i;
  var PASTV = /^(found|lost|met|got|had|saw|heard|ran|fell|built|came|went|kept|hid|knew|thought|wrote|gave|took|made|left|caught|broke|stole|became|woke|felt|told|said|won)$/;
  function isClause(t) {
    if (CLAUSE.test(' ' + t + ' ')) return true;
    var w = t.toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean);
    return w.some(function (x, i) { return i > 0 && VERBS[x] && (/[^s]s$|ed$/.test(x) || PASTV.test(x)); });
  }
  // lower-case the first word mid-sentence, unless it is a name: one the learner gave, or one capitalised in their idea
  var properHere = {};
  function lf(t, keep) {
    var m = t.match(/^([A-Za-z']+)/); if (!m) return t;
    var w = m[1];
    if (w === 'I' || (keep && keep[w]) || properHere[w] || COMMON_NAMES.test(w) || F_NAMES.test(w) || M_NAMES.test(w)) return t;
    if (/^[A-Z]{2,}$/.test(w)) return t; // an acronym
    return w.toLowerCase() + t.slice(w.length);
  }
  function ideaPhrase(idea) {
    var s = stripEnd(idea), p;
    do { p = s; s = s.replace(/^(so\s+|well\s+|um+\s+)?((the|my) (idea|story) (is|would be)( about)?|(it'?s|this is) (a story )?about|i want to (write|tell) (a story )?about|a story about)\s+/i, ''); } while (s !== p);
    return s || stripEnd(idea);
  }

  function spine(ctx, answers, keep, extra) {
    answers = answers || {}; keep = keep || {}; extra = extra || {};
    var X = function (slot, lens) { return extra[slot] ? { t: lf(tidy(extra[slot], keep), keep), own: lens, added: slot } : null; };
    properHere = {}; clean(ctx.idea).split(' ').forEach(function (x, i) { x = x.replace(/[^A-Za-z']/g, ''); if (i > 0 && /^[A-Z][a-z]/.test(x)) properHere[x] = 1; });
    var T = function (id) { return answers[id] ? tidy(answers[id].text, keep) : null; };
    var own = function (lens, t) { return { t: t, own: lens }; };
    var fw = function (t) { return { t: t }; };
    var has = function (id) { return !!answers[id]; };
    if (ctx.mode === 'teacher') return lessonSpine(ctx, answers, keep);
    if (ctx.mode !== 'story') return thinkingSpine(ctx, answers, keep, T, own, fw);

    var r = storyRefs(ctx, answers), name = r.name, pl = !!r.pr.pl;
    var subj = r.pr.g === 'x' ? 'it' : r.s;                 // pronoun used after we've met them
    var Subj = cap(subj), V = function (a, b) { return pl ? b : a; };
    var who = ctx.subjPhrase ? ctx.subjPhrase.replace(/^(a|an)\s/i, 'the ') : null;
    var idea = ideaPhrase(ctx.idea), ideaL = lf(idea, keep);
    var lines = { begin: [], middle: [], turn: [] };

    // BEGINNING: World + idea + Character
    var w = T('world'), b = [];
    if (w && isClause(w)) b.push(fw('In a world where '), own('world', lf(w, keep)), fw(', it begins '), fw(isClause(idea) ? 'when ' : 'with '), own('idea', ideaL), fw('.'));
    else { if (w) lines.begin.push([fw('The world: '), own('world', lf(w, keep)), fw('.')]); b.push(fw('It begins '), fw(isClause(idea) ? 'when ' : 'with '), own('idea', ideaL), fw('.')); }
    lines.begin.push(b);
    var c = T('character');
    if (c) {
      if (name && c.toLowerCase().indexOf(name.toLowerCase()) === 0) lines.begin.push(X('charDetail', 'character') ? [fw('Meet '), own('character', c), fw(', '), X('charDetail', 'character'), fw('.')] : [fw('Meet '), own('character', c), fw('.')]);
      else if (who) lines.begin.push([own('idea', cap(who)), fw(': '), own('character', lf(c, keep)), fw('.')]);
      else lines.begin.push([fw('At the center: '), own('character', lf(c, keep)), fw('.')]);
      if (X('charDetail', 'character') && !(name && c.toLowerCase().indexOf(name.toLowerCase()) === 0)) lines.begin.push([fw('In one word: '), X('charDetail', 'character'), fw('.')]);
    }
    if (X('worldHow', 'world')) lines.begin.push([fw('Here, '), X('worldHow', 'world'), fw('.')]);
    var N = name ? own('character', name) : who ? own('idea', who) : fw(subj);
    var NC = name ? N : who ? own('idea', cap(who)) : fw(Subj);

    // MIDDLE: Goal, Obstacle, Stakes
    var g = T('goal'), gl = g && lf(g, keep);
    var gm = gl && gl.match(/^((she|he|they|it|i)\s+)?(wants?|needs?)\s+/i);
    function goalFor(plural) {
      var W = plural ? ' want ' : ' wants ';
      if (!gl) return null;
      if (/^to\s/i.test(gl)) return [fw(W), own('goal', gl)];
      if (gm) return gm[1] ? [fw(W), own('goal', gl.slice(gm[0].length))] : [fw(' '), own('goal', gl)];
      if (GOALVERB.test(gl)) return [fw(W + 'to '), own('goal', gl)];
      if (isClause(gl)) return [fw(plural ? ' have one goal: ' : ' has one goal: '), own('goal', gl)];
      return [fw(W), own('goal', gl)];
    }
    if (g) lines.middle.push(gm && gm[1] ? [own('goal', cap(g)), fw('.')] : [fw(Subj)].concat(goalFor(pl), [fw('.')]));
    if (X('goalWhy', 'goal')) { var gw = X('goalWhy', 'goal'); gw.t = gw.t.replace(/^because\s+/i, ''); lines.middle.push([fw('Because '), gw, fw('.')]); }
    var nameSubj = !!(name || who), goalSeg = goalFor(nameSubj ? false : pl);
    var o = T('obstacle'), obSeg = null;
    if (o) { obSeg = isClause(o) ? [fw('but '), own('obstacle', lf(o, keep))] : [fw('but '), own('obstacle', lf(o, keep)), fw(' stands in the way')]; lines.middle.push([fw('But ')].concat(obSeg.slice(1), [fw('.')])); if (X('getPast', 'obstacle')) lines.middle.push([fw('To get past it: '), X('getPast', 'obstacle'), fw('.')]); }
    var k = T('stakes');
    if (k) {
      if (/^if\s/i.test(k)) lines.middle.push([own('stakes', k), fw('.')]);
      else if (isClause(k)) lines.middle.push([fw('If ' + subj + ' ' + V('walks', 'walk') + ' away, '), own('stakes', lf(k, keep)), fw('.')]);
      else lines.middle.push([fw('What\u2019s at stake: '), own('stakes', lf(k, keep)), fw('.')]);
    }
    if (k && X('loss', 'stakes')) lines.middle.push([fw('What ' + subj + ' would lose: '), X('loss', 'stakes'), fw('.')]);
    // TURN: Perspective + Twist
    var pv = T('perspective');
    if (pv) lines.turn.push([fw('What ' + subj + ' ' + V('doesn\u2019t', 'don\u2019t') + ' realize: '), own('perspective', lf(pv, keep)), fw('.')]);
    var tw = T('twist');
    if (tw) lines.turn.push([fw('And the twist: '), own('twist', lf(tw, keep)), fw('.')]);
    if (X('reveal', 'twist')) lines.turn.push([fw('The moment it comes out: '), X('reveal', 'twist'), fw('.')]);

    // logline: one sentence
    var L = [];
    if (w && isClause(w)) L.push(fw('In a world where '), own('world', lf(w, keep)), fw(', '), name ? N : who ? own('idea', who) : fw(subj));
    else L.push(NC);
    if (goalSeg) L = L.concat(goalSeg); else if (c && !name) L.push(fw(', '), own('character', lf(c, keep)), fw(','));
    if (obSeg) L.push(fw(goalSeg ? ', ' : ' faces this: ')), L = L.concat(goalSeg ? obSeg : obSeg.slice(1));
    else if (tw) L.push(fw(', until '), own('twist', lf(tw, keep)));
    L.push(fw('.'));
    if (!goalSeg && !obSeg && !tw) L = [fw('It begins '), fw(isClause(idea) ? 'when ' : 'with '), own('idea', ideaL), fw('.')];

    var OBJ = ctx.objPhrase ? ctx.objPhrase.replace(/^(a|an)\s/i, 'the ') : null;
    if (OBJ && ctx.obj) { var adj = ctx.idea.match(new RegExp('\\b(locked|hidden|secret|old|strange|glowing|broken|forgotten|mysterious|tiny|giant|magic|empty|lost)\\s+' + ctx.obj + '\\b', 'i')); if (adj && OBJ.indexOf(adj[1].toLowerCase()) < 0) OBJ = 'the ' + adj[1].toLowerCase() + ' ' + ctx.obj; }
    var nm = name || who || subj;
    return {
      kind: 'story', title: 'Your story, in your words', eyebrow: 'You built a story',
      logline: L,
      acts: [
        { id: 'begin', label: 'Beginning', lenses: ['world', 'idea', 'character'], lines: lines.begin },
        { id: 'middle', label: 'Middle', lenses: ['goal', 'obstacle', 'stakes'], lines: lines.middle },
        { id: 'turn', label: 'Turn', lenses: ['perspective', 'twist'], lines: lines.turn }
      ].filter(function (a) { return a.lines.length; }),
      seed: OBJ ? 'Start where ' + nm + ' first sees ' + OBJ + '.' : 'Start with ' + nm + ', right before everything changes.',
      firstLabel: 'Write the first line', closing: 'Every underlined word came from you. STORIGEN only asked.'
    };
  }

  function thinkingSpine(ctx, answers, keep, T, own, fw) {
    var prob = ctx.mode === 'problem', q = stripEnd(ctx.idea) + (ctx.question || /\?$/.test(ctx.idea) ? '?' : '');
    var row = function (label, id) { var t = T(id); return t ? [fw(label), own(id, t)] : null; };
    var acts = [
      { id: 'know', label: 'What you know', lenses: ['idea', 'character', 'goal', 'world'],
        lines: [[fw(prob ? 'The problem: ' : 'The question: '), own('idea', cap(q))], row('Who\u2019s involved: ', 'character'), row(prob ? 'What \u201Csolved\u201D looks like: ' : 'What they\u2019re trying to do: ', 'goal'), row(prob ? 'When and where: ' : 'Where it happens: ', 'world')] },
      { id: 'way', label: 'What\u2019s in the way', lenses: ['obstacle', 'stakes'], lines: [row('What\u2019s in the way: ', 'obstacle'), row('Why it matters: ', 'stakes')] },
      { id: 'change', label: 'What could change', lenses: ['perspective', 'twist'], lines: [row('Another angle: ', 'perspective'), row('What could change: ', 'twist')] }
    ];
    acts.forEach(function (a) { a.lines = a.lines.filter(Boolean); });
    var o = T('obstacle'), L = [fw(prob ? 'You started with ' : 'You asked '), own('idea', '\u201C' + cap(q) + '\u201D')];
    if (o) L.push(fw(' and found what\u2019s in the way: '), own('obstacle', lf(o, keep)));
    L.push(fw('.'));
    return { kind: 'thinking', title: 'Your thinking, in your words', eyebrow: prob ? 'You mapped a problem' : 'You mapped a question', logline: L,
      acts: acts.filter(function (a) { return a.lines.length; }),
      seed: prob ? 'Write the first small step you will take.' : 'Write one sentence that answers your question, in your own words.',
      firstLabel: prob ? 'Write my first step' : 'Write the first line', closing: 'Every underlined word came from you. STORIGEN only asked.' };
  }

  // Teacher: the same 7-step plan, as segments, grouped into an inquiry arc.
  function lessonSegs(ctx, answers, keep) {
    var own = function (lens, t) { return { t: t, own: lens }; }, fw = function (t) { return { t: t }; };
    var g = function (id, fb) { return answers[id] ? own(id, lf(tidy(answers[id].text, keep), keep)) : fw(fb); };
    var c = g('character', 'the key actors');
    return [
      { lens: 'world', move: 'Open the world', segs: [fw('Students explore '), g('world', 'the setting'), fw('. Ask: \u201CWhat are the rules here?\u201D')] },
      { lens: 'character', move: 'Meet the characters', segs: [fw('Students identify and sort '), c, fw('. Ask: \u201CWho lives in this world?\u201D')] },
      { lens: 'goal', move: 'Name the goal', segs: [fw('Ask: \u201CWhat are '), c, fw(' trying to do?\u201D Students defend their answer. Target idea: '), g('goal', 'their purpose'), fw('.')] },
      { lens: 'obstacle', move: 'Find the obstacle', segs: [fw('Students list what makes it hard: '), g('obstacle', 'the constraints'), fw('. Ask: \u201CWhich obstacle matters most? Why?\u201D')] },
      { lens: 'stakes', move: 'Weigh the stakes', segs: [fw('Students predict what happens if '), c, fw(' fail: '), g('stakes', 'the consequences'), fw('.')] },
      { lens: 'perspective', move: 'Switch perspective', segs: [fw('Small groups each take one view ('), g('perspective', 'different viewpoints'), fw(') and explain the same event from it.')] },
      { lens: 'twist', move: 'Introduce the twist', segs: [fw('Change one thing: '), g('twist', 'one variable'), fw('. Students revise their map and explain what changed and why.')] }
    ];
  }
  function lessonSpine(ctx, answers, keep) {
    var own = function (lens, t) { return { t: t, own: lens }; }, fw = function (t) { return { t: t }; };
    var steps = lessonSegs(ctx, answers, keep), by = {}; steps.forEach(function (s, i) { s.n = i + 1; by[s.lens] = s; });
    var line = function (id) { var s = by[id]; return [{ t: s.n + '. ' + s.move + ' \u00B7 ', step: true }].concat(s.segs); };
    var L = [fw('Grade ' + ctx.grade + ' students investigate '), own('idea', ctx.topic)];
    if (answers.character) L.push(fw(' through '), own('character', lf(tidy(answers.character.text, keep), keep)));
    if (answers.obstacle) L.push(fw(', and work out what\u2019s in the way: '), own('obstacle', lf(tidy(answers.obstacle.text, keep), keep)));
    L.push(fw('.'));
    return { kind: 'lesson', title: 'Your learning experience', eyebrow: 'Built from your map', logline: L,
      acts: [
        { id: 'open', label: 'Open', lenses: ['world', 'character'], lines: [line('world'), line('character')] },
        { id: 'investigate', label: 'Investigate', lenses: ['goal', 'obstacle', 'stakes'], lines: [line('goal'), line('obstacle'), line('stakes')] },
        { id: 'turn', label: 'Turn', lenses: ['perspective', 'twist'], lines: [line('perspective'), line('twist')] }
      ],
      steps: steps,
      exit: 'Exit ticket: \u201CWhich lens helped you understand ' + ctx.topic + ' most, and what evidence shows it?\u201D',
      seed: 'Write the hook you\u2019ll say to open the first lesson.', firstLabel: 'Write my opening hook',
      closing: 'Every underlined word came from you. STORIGEN only asked.' };
  }

  /* ---------- "What your story is telling you": connections, tensions, next moves, strength ----------
     Built from lens pairs + words pulled from the learner's own answers. Always phrased as questions; never adds plot. */
  var BIG = /\b(only chance|everything|forever|die|dies|death|never|all of|whole world|lose (it|her|him|them) all|last chance|no way back|everyone)\b/i;
  var SECRETW = /\b(secret|secrets|hidden|hide|hiding|truth|mystery|lie|lies)\b/i;
  var WATCHW = /\b(watched|watching|watch|seen|cameras?|spy|spies|no one|nobody|rules?|forbidden|not allowed)\b/i;
  var OWNERW = /\b(belong|belongs|someone else|owner|whose|not hers|not his|not theirs)\b/i;
  function wordsOf(t) { return stripEnd(t || '').toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(function (w) { return w.length > 2 && !STOPK[w] && !VERBS[w]; }); }
  function sharedWord(a, b) { var wb = {}; wordsOf(b).forEach(function (w) { wb[w] = 1; }); var hit = wordsOf(a).filter(function (w) { return wb[w]; }); return hit.length ? hit[hit.length - 1] : null; }
  function ideaNouns(ctx) { return wordsOf(ideaPhrase(ctx.idea)).filter(function (w) { return !/^(girl|boy|kid|child|robot|man|woman|person)$/.test(w) && !(ctx.obj && w === ctx.obj); }); }
  function objPhrase(ctx) {
    var OBJ = ctx.objPhrase ? ctx.objPhrase.replace(/^(a|an)\s/i, 'the ') : null;
    if (OBJ && ctx.obj) { var adj = ctx.idea.match(new RegExp('\\b(locked|hidden|secret|old|strange|glowing|broken|forgotten|mysterious|tiny|giant|magic|empty|lost)\\s+' + ctx.obj + '\\b', 'i')); if (adj && OBJ.indexOf(adj[1].toLowerCase()) < 0) OBJ = 'the ' + adj[1].toLowerCase() + ' ' + ctx.obj; }
    return OBJ;
  }
  var EXTRA_SLOTS = {
    charDetail: { act: 'begin', lens: 'character' }, goalWhy: { act: 'middle', lens: 'goal' }, getPast: { act: 'middle', lens: 'obstacle' },
    loss: { act: 'middle', lens: 'stakes' }, reveal: { act: 'turn', lens: 'twist' }, worldHow: { act: 'begin', lens: 'world' }
  };

  function insights(ctx, answers, keep, extra) {
    answers = answers || {}; extra = extra || {}; keep = keep || {};
    var out = { connections: [], tensions: [], next: [], strength: {} };
    if (ctx.mode !== 'story') return out;
    var A = function (id) { return answers[id] ? tidy(answers[id].text, keep) : null; };
    var low = function (id) { var t = A(id); return t ? lf(t, keep) : null; };
    var r = storyRefs(ctx, answers), N = r.name || (ctx.subjPhrase ? ctx.subjPhrase.replace(/^(a|an)\s/i, 'the ') : r.s);
    var s = r.pr.g === 'x' ? 'it' : r.s, o = r.pr.g === 'x' ? 'it' : r.o, pl = !!r.pr.pl, V = function (a, b) { return pl ? b : a; };
    var OBJ = objPhrase(ctx), nouns = ideaNouns(ctx);
    var q = function (t) { return '\u201C' + t + '\u201D'; };

    // (a) connections between lenses
    var ob = A('obstacle'), pv = A('perspective'), tw = A('twist'), wd = A('world'), gl = A('goal'), st = A('stakes'), ch = A('character');
    var obAboutObj = ob && OBJ && (/\b(lock|locked|open|door|key)\b/i.test(ob) || ob.toLowerCase().indexOf(ctx.obj) >= 0);
    var pvNoun = pv && nouns.filter(function (n) { return pv.toLowerCase().indexOf(n) >= 0; })[0];
    var twNoun = tw && nouns.filter(function (n) { return tw.toLowerCase().indexOf(n) >= 0; })[0];
    if (obAboutObj && pvNoun) out.connections.push({ lenses: ['obstacle', 'perspective'],
      text: 'Your obstacle (' + OBJ + ') and your perspective (the ' + pvNoun + ') point at the same secret. ' + (OWNERW.test(pv) ? 'Is ' + OBJ + ' hiding the ' + pvNoun + '\u2019s real owner?' : 'Is ' + OBJ + ' keeping ' + N + ' from the truth about the ' + pvNoun + '?') });
    var kw = ob && tw && sharedWord(ob, tw);
    if (kw) {
      var neg = /\b(not|no|never|doesn't|don't|can't|cannot|without)\b/i.test(ob);
      out.connections.push({ lenses: ['obstacle', 'twist'], text: neg
        ? 'Your obstacle says ' + s + ' ' + V('doesn\u2019t', 'don\u2019t') + ' have the ' + kw + '. Your twist says ' + s + ' ' + V('has', 'have') + ' been the ' + kw + ' all along. What does ' + N + ' have to see to know it?'
        : 'Your obstacle and your twist both turn on \u201C' + kw + '.\u201D Is that the thread that ties the whole story together?' });
    }
    if (wd && gl && WATCHW.test(wd) && SECRETW.test(gl)) out.connections.push({ lenses: ['world', 'goal'],
      text: 'In a world where ' + lf(wd, keep) + ', how does ' + N + ' keep ' + (/secrets?/i.test(gl) ? 'the ' + gl.match(/secrets?/i)[0].toLowerCase() : 'it') + ' hidden?' });
    if (tw && !kw && twNoun && !pvNoun) out.connections.push({ lenses: ['idea', 'twist'], text: 'Your twist brings back the ' + twNoun + ' from your very first idea. Was it there for a reason from the start?' });
    if (pv && tw && !kw && out.connections.length < 2) { var k2 = sharedWord(pv, tw); if (k2) out.connections.push({ lenses: ['perspective', 'twist'], text: 'Your perspective and your twist both mention \u201C' + k2 + '.\u201D Who knows the truth about it first?' }); }
    if (out.connections.length < 2 && wd && ob) out.connections.push({ lenses: ['world', 'obstacle'], text: 'Does ' + q(lf(wd, keep)) + ' make ' + q(lf(ob, keep)) + ' harder, or is it what causes it?' });

    // (b) tensions and gaps
    var goalThin = gl && (gl.split(' ').length <= 4 && !isClause(gl) && !/^to\s/i.test(gl));
    if (st && gl && BIG.test(st) && goalThin && !extra.goalWhy) out.tensions.push({ lenses: ['stakes', 'goal'],
      text: 'Your stakes are big (' + q(lf(st, keep)) + '), but ' + N + '\u2019s goal is still fuzzy (' + q(lf(gl, keep)) + '). What would make ' + o + ' risk everything for it?' });
    else if (st && gl && !BIG.test(st)) out.tensions.push({ lenses: ['stakes', 'goal'], text: 'If ' + N + ' never ' + V('gets', 'get') + ' ' + q(lf(gl, keep)) + ', is ' + q(lf(st, keep)) + ' really the worst that could happen?' });
    if (ch && ch.split(' ').length <= 2 && r.name && !extra.charDetail) out.tensions.push({ lenses: ['character'], text: 'You named ' + r.name + ', but we don\u2019t know who ' + s + ' ' + V('is', 'are') + ' yet. One word about ' + o + ' would make the beginning stronger.' });
    LENSES.forEach(function (l) { if (!answers[l.id]) out.tensions.push({ lenses: [l.id], text: 'Your ' + l.name.toLowerCase() + ' lens is still open. The story has a gap there.' }); });

    // (c) next moves: 2-3 tappable questions that add to the spine
    var cand = [];
    if (ch && !extra.charDetail && ch.split(' ').length <= 3) cand.push({ slot: 'charDetail', q: 'What\u2019s one word that describes ' + N + '?', ph: 'One word is enough' });
    if (gl && !extra.goalWhy) cand.push({ slot: 'goalWhy', q: 'Why ' + (/secrets/i.test(gl) ? 'do those secrets' : 'does that') + ' matter so much to ' + N + '?', ph: 'Because' });
    if (tw && !extra.reveal) cand.push({ slot: 'reveal', q: 'When does ' + N + ' find out?', ph: 'The moment it comes out' });
    if (ob && !extra.getPast) cand.push({ slot: 'getPast', q: 'How could ' + N + ' get past it' + (OBJ && obAboutObj ? ', without the key?' : '?').replace(', without the key?', /key/i.test(ob) ? ', without the key?' : '?'), ph: 'One idea is enough' });
    if (st && !extra.loss) cand.push({ slot: 'loss', q: 'What exactly would ' + N + ' lose?', ph: 'Name it' });
    if (wd && !extra.worldHow) cand.push({ slot: 'worldHow', q: 'Who is watching, and why?'.replace('Who is watching, and why?', WATCHW.test(wd) ? 'Who is watching, and why?' : 'What is one rule of this world?'), ph: 'Your idea' });
    out.next = cand.slice(0, 3).map(function (c) { c.lens = EXTRA_SLOTS[c.slot].lens; c.act = EXTRA_SLOTS[c.slot].act; return c; });

    // (d) story strength per act
    var depth = function (id) { var t = A(id); return !t ? 0 : 1 + (t.split(' ').length >= 4 ? 0.5 : 0); };
    var actOf = { begin: ['world', 'character'], middle: ['goal', 'obstacle', 'stakes'], turn: ['perspective', 'twist'] };
    Object.keys(actOf).forEach(function (a) {
      var ids = actOf[a], max = ids.length * 1.5 + 1, sc = ids.reduce(function (n, id) { return n + depth(id); }, 0);
      Object.keys(extra).forEach(function (k) { if (EXTRA_SLOTS[k] && EXTRA_SLOTS[k].act === a && extra[k]) sc += 1; });
      var pct = Math.min(1, sc / max);
      out.strength[a] = { pct: Math.round(pct * 100), label: pct >= 0.9 ? 'Vivid' : pct >= 0.7 ? 'Strong' : pct >= 0.45 ? 'Solid' : 'Taking shape' };
    });
    return out;
  }

  /* ---------- teacher: turn the map into a learning experience ---------- */
  function lessonPlan(ctx, answers) {
    var g = function (id, fb) { return answers[id] ? stripEnd(answers[id].text) : fb; };
    var t = ctx.topic, c = g('character', 'the key actors');
    return {
      title: cap(t) + ' as structured inquiry',
      sub: 'Grade ' + ctx.grade + ' \u00B7 7 moves \u00B7 one lens at a time',
      steps: [
        { lens: 'world', move: 'Open the world', text: 'Students explore ' + g('world', 'the setting') + '. Ask: \u201CWhat are the rules here?\u201D' },
        { lens: 'character', move: 'Meet the characters', text: 'Students identify and sort ' + c + '. Ask: \u201CWho lives in this world?\u201D' },
        { lens: 'goal', move: 'Name the goal', text: 'Ask: \u201CWhat are ' + c + ' trying to do?\u201D Students defend their answer. Target idea: ' + g('goal', 'their purpose') + '.' },
        { lens: 'obstacle', move: 'Find the obstacle', text: 'Students list what makes it hard: ' + g('obstacle', 'the constraints') + '. Ask: \u201CWhich obstacle matters most? Why?\u201D' },
        { lens: 'stakes', move: 'Weigh the stakes', text: 'Students predict what happens if ' + c + ' fail: ' + g('stakes', 'the consequences') + '.' },
        { lens: 'perspective', move: 'Switch perspective', text: 'Small groups each take one view (' + g('perspective', 'different viewpoints') + ') and explain the same event from it.' },
        { lens: 'twist', move: 'Introduce the twist', text: 'Change one thing: ' + g('twist', 'one variable') + '. Students revise their map and explain what changed and why.' }
      ],
      exit: 'Exit ticket: \u201CWhich lens helped you understand ' + t + ' most, and what evidence shows it?\u201D'
    };
  }

  global.StorigenEngine = { LENSES: LENSES, analyze: analyze, questionFor: questionFor, reframe: reframe, lessonPlan: lessonPlan, spine: spine, insights: insights, nameFrom: nameFrom, shorten: shorten, tidy: tidy };
})(typeof window !== 'undefined' ? window : globalThis);
