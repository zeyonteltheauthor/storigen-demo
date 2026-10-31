/* STORIGEN OS demo — interface. Static, offline, nothing leaves the browser. */
(function () {
  'use strict';
  var E = window.StorigenEngine, LENSES = E.LENSES;
  var BY_ID = {}; LENSES.forEach(function (l) { BY_ID[l.id] = l; });
  var $ = function (s) { return document.querySelector(s); };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Night palette: each SOS-DS-001 lens hue family, lifted for AA on the dark canvas (c = text/stroke, g = glow, t = deep tint)
  var NIGHT = {
    character:   { c: '#FDBA74', g: '#F97316', t: 'rgba(124,45,18,.42)' },
    goal:        { c: '#5EEAD4', g: '#14B8A6', t: 'rgba(15,118,110,.36)' },
    obstacle:    { c: '#FCA5A5', g: '#EF4444', t: 'rgba(153,27,27,.40)' },
    stakes:      { c: '#FCD34D', g: '#F59E0B', t: 'rgba(146,64,14,.40)' },
    perspective: { c: '#93C5FD', g: '#3B82F6', t: 'rgba(30,58,138,.46)' },
    world:       { c: '#BEF264', g: '#84CC16', t: 'rgba(63,98,18,.42)' },
    twist:       { c: '#D8B4FE', g: '#A855F7', t: 'rgba(126,34,206,.38)' }
  };
  LENSES.forEach(function (l) { var n = NIGHT[l.id]; l.brandColor = l.color; l.color = n.c; l.tint = n.t; l.glow = n.g; });
  var GOLD = '#F2DDA4';

  // One outline family, drawn for STORIGEN: person, target, barrier, flame, eye, globe, turn + spark, lantern.
  var ICON = {
    character: '<circle cx="12" cy="7.6" r="3.6"/><path d="M4.8 20.4c.9-4.1 3.7-6.2 7.2-6.2s6.3 2.1 7.2 6.2"/><circle class="f" cx="18.6" cy="4.6" r="1"/>',
    goal: '<circle cx="11" cy="13" r="7.8"/><circle cx="11" cy="13" r="3.9"/><circle class="f" cx="11" cy="13" r="1.1"/><path d="M11 13l8.2-8.2M16.4 4.6h3v3"/>',
    obstacle: '<path d="M3.5 9h17v10h-17z"/><path d="M3.5 14h17M8.5 9v5M15.5 9v5M6 14v5M12 14v5M18 14v5"/><path d="M7 5.5l2 3.5M17 5.5l-2 3.5"/>',
    stakes: '<path d="M12 3.2c.7 3.3 5 4.9 5 9.9a5 5 0 0 1-10 0c0-2.5 1.4-3.7 2.1-5.2.7 1.3 1.3 2 2.2 2.2-.3-2.6.1-4.8.7-6.9z"/><path class="f" d="M12 20.1c-1.2 0-2.1-.9-2.1-2 0-1.3 1.1-1.9 2.1-3.3 1 1.4 2.1 2 2.1 3.3 0 1.1-.9 2-2.1 2z"/>',
    perspective: '<path d="M2.4 12S6 5.4 12 5.4 21.6 12 21.6 12 18 18.6 12 18.6 2.4 12 2.4 12z"/><circle cx="12" cy="12" r="3.3"/><circle class="f" cx="13.3" cy="10.7" r=".9"/>',
    world: '<circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2M12 3.4c2.6 2.4 3.7 5.3 3.7 8.6s-1.1 6.2-3.7 8.6M12 3.4C9.4 5.8 8.3 8.7 8.3 12s1.1 6.2 3.7 8.6"/><path d="M5 7.5h14M5 16.5h14" opacity=".55"/>',
    twist: '<path d="M18.8 9A7.4 7.4 0 0 0 5.4 8.4"/><path d="M5.2 15a7.4 7.4 0 0 0 13.4.6"/><path d="M19.4 4.6V9h-4.4M4.6 19.4V15H9"/><path class="f" d="M12 9.6l.75 1.65L14.4 12l-1.65.75L12 14.4l-.75-1.65L9.6 12l1.65-.75z"/>',
    idea: '<path d="M10 4.2h4M12 2.4v1.8M8.2 6.6h7.6l-.9 10.2H9.1z"/><path d="M7.2 6.6h9.6M8.6 19.6h6.8M12 16.8v2.8"/><path class="f" d="M12 9.4c1 1.1 1.6 2 1.6 3a1.6 1.6 0 0 1-3.2 0c0-1 .6-1.9 1.6-3z"/>'
  };
  function icon(id) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + ICON[id] + '</svg>'; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var SHORT = { character: 'Who is it about?', goal: 'What do they want?', obstacle: 'What stands in the way?', stakes: 'Why does it matter?',
    perspective: 'Who sees it?', world: 'Where does it happen?', twist: 'What changes everything?' };
  var CHAIN = [['character', 'goal', 'wants'], ['goal', 'obstacle', 'blocked by'], ['obstacle', 'stakes', 'or else'], ['stakes', 'perspective', 'seen by'],
    ['perspective', 'world', 'inside'], ['world', 'twist', 'until'], ['twist', 'character', 'changes']];

  /* ---------------- sound: Web Audio only, off by default, remembered on this device ---------------- */
  var Sound = (function () {
    var KEY = 'storigen.sound', on = false, ctx = null, master = null, played = [];
    try { on = localStorage.getItem(KEY) === 'on'; } catch (e) {}
    var BASE = reduce ? 0.05 : 0.1; // quieter for reduced-motion users
    function ensure() {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
        ctx = new AC(); master = ctx.createGain(); master.gain.value = BASE;
        var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
        master.connect(comp); comp.connect(ctx.destination);
      }
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      return ctx;
    }
    function env(g, t, peak, a, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
    function note(f, t, peak, a, d, type, dest) {
      var o = ctx.createOscillator(), g = ctx.createGain(); o.type = type || 'sine'; o.frequency.value = f;
      env(g, t, peak, a, d); o.connect(g); g.connect(dest || master); o.start(t); o.stop(t + a + d + 0.05);
    }
    var PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];
    var CUES = {
      chime: function (t, i, soft) { var f = PENTA[(i || 0) % PENTA.length], k = soft ? 0.45 : 1; note(f, t, 0.32 * k, 0.008, 1.3); note(f * 2, t, 0.07 * k, 0.008, 0.7); note(f * 3.01, t, 0.025 * k, 0.005, 0.35); },
      land: function (t) { note(392, t, 0.3, 0.01, 0.5, 'triangle'); note(587.33, t + 0.07, 0.24, 0.01, 0.8); note(196, t, 0.12, 0.02, 0.6); },
      swell: function (t) {
        var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(380, t); lp.frequency.exponentialRampToValueAtTime(2600, t + 1.1); lp.frequency.exponentialRampToValueAtTime(700, t + 3); lp.connect(master);
        [261.63, 329.63, 392, 493.88, 587.33].forEach(function (f, i) { note(f, t + i * 0.05, 0.11, 0.9, 2.1, 'sawtooth', lp); note(f * 1.004, t + i * 0.05, 0.08, 0.9, 2.1, 'sine', lp); });
      },
      reveal: function (t) {
        var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(3200, t + 1.4); lp.frequency.exponentialRampToValueAtTime(900, t + 3.6); lp.connect(master);
        [196, 293.66, 392, 493.88].forEach(function (f) { note(f, t, 0.09, 1.2, 2.6, 'sawtooth', lp); note(f * 1.003, t, 0.07, 1.2, 2.6, 'sine', lp); });
        PENTA.forEach(function (f, i) { note(f, t + 0.35 + i * 0.11, 0.16, 0.006, 1.1); note(f * 2, t + 0.35 + i * 0.11, 0.03, 0.006, 0.5); });
      },
      whoosh: function (t) {
        var len = 1.0, buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate), d = buf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        var src = ctx.createBufferSource(); src.buffer = buf;
        var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
        bp.frequency.setValueAtTime(260, t); bp.frequency.exponentialRampToValueAtTime(2200, t + 0.42); bp.frequency.exponentialRampToValueAtTime(500, t + len);
        var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(reduce ? 0.18 : 0.32, t + 0.38); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        src.connect(bp); bp.connect(g); g.connect(master); src.start(t); src.stop(t + len);
      }
    };
    function play(name, arg, soft) {
      if (!on) return;
      try { if (!ensure()) return; CUES[name](ctx.currentTime + 0.01, arg, soft); played.push(name); } catch (e) { /* sound is decoration; never break the flow */ }
    }
    function sync() {
      var b = document.getElementById('soundToggle'); if (!b) return;
      b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.title = on ? 'Sound is on' : 'Sound is off';
    }
    function set(v) { on = !!v; try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) {} sync(); if (on) play('chime', 2, true); }
    return { play: play, set: set, isOn: function () { return on; }, sync: sync, played: played };
  })();
  Sound.sync();
  $('#soundToggle').addEventListener('click', function () { Sound.set(!Sound.isOn()); });

  /* ---------------- sky: a still star field, a few slow twinklers ---------------- */
  function paintSky() {
    var cv = $('#sky'); if (!cv || !cv.getContext) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2), w = window.innerWidth, h = window.innerHeight;
    cv.width = w * dpr; cv.height = h * dpr; var g = cv.getContext('2d'); g.scale(dpr, dpr);
    var seed = 7, rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    var n = Math.round(w * h / 5200);
    for (var i = 0; i < n; i++) {
      var x = rnd() * w, y = rnd() * h, r = rnd() < 0.08 ? 1.2 + rnd() * 0.6 : 0.35 + rnd() * 0.7, a = 0.15 + rnd() * 0.55, gold = rnd() < 0.18;
      g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fillStyle = gold ? 'rgba(242,221,164,' + a + ')' : 'rgba(220,228,255,' + a + ')'; g.fill();
    }
    // a faint constellation in one corner: seven stars, one per lens
    var pts = [[.08, .2], [.14, .13], [.2, .18], [.18, .28], [.26, .31], [.31, .24], [.36, .29]].map(function (p) { return [p[0] * w, p[1] * h]; });
    g.strokeStyle = 'rgba(242,221,164,.08)'; g.lineWidth = 1; g.beginPath();
    pts.forEach(function (p, i) { i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }); g.stroke();
    pts.forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], 1.4, 0, 6.283); g.fillStyle = 'rgba(242,221,164,.45)'; g.fill(); });
    var tw = $('#twinkles');
    if (tw && !tw.childElementCount && !reduce) {
      var html = ''; for (var k = 0; k < 18; k++) html += '<i style="left:' + (rnd() * 100).toFixed(1) + '%;top:' + (rnd() * 100).toFixed(1) + '%;--d:' + (4 + rnd() * 6).toFixed(1) + 's;--w:' + (rnd() * 6).toFixed(1) + 's"></i>';
      tw.innerHTML = html;
    }
  }
  paintSky();

  /* ---------------- little lights: ripples and the know-flare ---------------- */
  function ripple(x, y, color, big) {
    if (reduce) return;
    var st = $('#stage'), d = document.createElement('div');
    d.className = 'ripple' + (big ? ' big' : ''); d.style.left = x + 'px'; d.style.top = y + 'px'; d.style.setProperty('--rc', color); if (big) d.style.setProperty('--rs', '16');
    st.appendChild(d); setTimeout(function () { d.remove(); }, 1400);
  }
  function flare() { var h = $('#halo'); h.classList.remove('flare'); void h.offsetWidth; h.classList.add('flare'); }

  var S; // state
  function fresh() { return { ctx: null, answers: {}, skipped: {}, current: null, view: null, knowShown: false, nodes: {}, phase: 'q', drawn: {}, extra: {}, firstLine: '', revealShown: false }; }

  /* ---------------- opening ---------------- */
  var EXAMPLES = ['A girl finds a locked door in her school.', 'Why do volcanoes erupt?', 'A lonely robot discovers a flower on Mars.', 'Grade 4 \u2014 ecosystems', 'I keep putting off my homework.'];
  var exIdx = 0, exTimer = null;
  function rotatePlaceholder() {
    var inp = $('#ideaInput');
    clearInterval(exTimer);
    exTimer = setInterval(function () { if (document.activeElement === inp && inp.value) return; exIdx = (exIdx + 1) % EXAMPLES.length; inp.placeholder = EXAMPLES[exIdx]; }, 4200);
  }

  $('#introForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = $('#ideaInput').value.trim() || $('#ideaInput').placeholder;
    start(v);
  });

  function start(text) {
    var ctx = E.analyze(text);
    if (!ctx) return;
    var msg = $('#introMsg');
    if (ctx.mode === 'care') {
      msg.hidden = false;
      msg.innerHTML = 'That sounds really heavy, and it matters. This isn\u2019t something to work through with an app. Please talk to a trusted adult today. In the U.S. you can call or text <b>988</b> any time to reach someone who can help.';
      return;
    }
    msg.hidden = true;
    clearInterval(exTimer);
    S = fresh(); S.ctx = ctx; $('#stage').parentNode.style.minHeight = '';
    var intro = $('#intro');
    intro.classList.add('leaving');
    setTimeout(function () {
      intro.hidden = true; intro.classList.remove('leaving');
      var app = $('#main'); app.hidden = false;
      requestAnimationFrame(function () { app.classList.add('shown'); });
      $('#modeTag').hidden = ctx.mode !== 'teacher';
      $('#modeTag').textContent = 'Teacher \u00B7 Grade ' + (ctx.grade || '');
      buildMap();
      S.current = nextLens();
      renderPanel();
    }, reduce ? 0 : 480);
  }

  $('#restart').addEventListener('click', function () {
    closeReveal();
    S = null;
    document.body.classList.remove('view-lens');
    $('#main').hidden = true; $('#main').classList.remove('shown');
    $('#nodes').innerHTML = ''; $('#links').innerHTML = '';
    $('#knowBanner').classList.remove('show');
    $('#viewTag').hidden = true;
    var intro = $('#intro'); intro.hidden = false;
    $('#ideaInput').value = ''; $('#ideaInput').focus();
    rotatePlaceholder();
  });

  /* ---------------- map ---------------- */
  function buildMap() {
    var nodesEl = $('#nodes'); nodesEl.innerHTML = ''; $('#links').innerHTML = '';
    var c = S.ctx;
    var idea = document.createElement('div');
    idea.className = 'node idea pop'; idea.id = 'node-idea';
    idea.innerHTML = '<div class="inner"><div class="kicker">' + icon('idea') + (c.mode === 'teacher' ? 'Your topic' : 'Your idea') + '</div><div class="txt">' + esc(c.idea) + '</div></div>';
    nodesEl.appendChild(idea);
    S.nodes.idea = { el: idea, x: 0, y: 0, tx: 0, ty: 0 };
    LENSES.forEach(function (l) {
      var d = document.createElement('div');
      d.className = 'node lens enter'; d.id = 'node-' + l.id; d.dataset.lens = l.id;
      d.style.setProperty('--c', l.color); d.style.setProperty('--t', l.tint); d.style.setProperty('--g', l.glow);
      d.innerHTML = '<button class="lens-btn" type="button" aria-label="' + l.name + ' lens"><div class="inner"><div class="lh"><span class="orb">' + icon(l.id) + '</span>' + l.name +
        '</div><div class="q"></div><div class="ans"></div><div class="own"></div><div class="rf"></div></div></button>';
      d.querySelector('button').addEventListener('click', function () { jumpTo(l.id); });
      nodesEl.appendChild(d);
      S.nodes[l.id] = { el: d, x: 0, y: 0, tx: 0, ty: 0 };
    });
    // svg defs
    var svg = $('#links');
    svg.innerHTML = '<g id="spokes"></g><g id="arcs"></g>';
    refreshNodes();
    var st = stageSize();
    Object.keys(S.nodes).forEach(function (k) { S.nodes[k].x = st.w / 2; S.nodes[k].y = st.h / 2; place(S.nodes[k]); });
    layout(true);
    // lenses bloom out one by one
    LENSES.forEach(function (l, i) {
      setTimeout(function () { if (!S || !S.nodes[l.id]) return; S.nodes[l.id].el.classList.remove('enter'); if (!reduce || i === 0) Sound.play('chime', i, i > 0); }, reduce ? 0 : 260 + i * 110);
    });
    ripple(st.w / 2, st.h / 2, '#D1A954', true);
  }

  function stageSize() { var r = $('#stage').getBoundingClientRect(); return { w: r.width, h: r.height }; }
  function place(n) { n.el.style.transform = 'translate(' + (n.x).toFixed(1) + 'px,' + (n.y).toFixed(1) + 'px) translate(-50%,-50%)'; }

  function layout(initial, depth, settled) {
    if (!S) return;
    // cards ease to their new width; measure again once they've settled
    if (!settled && !depth) { clearTimeout(S.settle); var s0 = S; S.settle = setTimeout(function () { if (S === s0) layout(false, 0, true); }, reduce ? 30 : 560); }
    var st = stageSize(), W = st.w, H = st.h, cx = W / 2, cy = H / 2;
    var centerId = S.view || 'idea';
    var ring = S.view ? ['idea'].concat(LENSES.map(function (l) { return l.id; }).filter(function (id) { return id !== S.view; }))
                      : LENSES.map(function (l) { return l.id; });
    var maxW = 0, maxH = 0;
    ring.forEach(function (id) { var e = S.nodes[id].el.firstElementChild; maxW = Math.max(maxW, e.offsetWidth); maxH = Math.max(maxH, e.offsetHeight); });
    var rx = Math.max(60, W / 2 - maxW / 2 - 8), ry = Math.max(60, H / 2 - maxH / 2 - 10);
    if (W > 700) rx = Math.min(rx, ry * 1.55);
    S.nodes[centerId].tx = cx; S.nodes[centerId].ty = cy;
    ring.forEach(function (id, i) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / ring.length;
      S.nodes[id].tx = cx + rx * Math.cos(a); S.nodes[id].ty = cy + ry * Math.sin(a);
    });
    Object.keys(S.nodes).forEach(function (id) {
      var el = S.nodes[id].el;
      el.classList.toggle('center', id === centerId && id !== 'idea');
      el.classList.toggle('side', id === 'idea' && centerId !== 'idea');
      el.style.zIndex = id === centerId ? 3 : 2;
    });
    if (relax(W, H, centerId) && (depth || 0) < 6 && W < 700) {
      // long answers on a small screen: give the map a little more sky instead of hiding words
      var wrap = $('#stage').parentNode; wrap.style.minHeight = Math.round(H + 30) + 'px';
      if (stageSize().h > H + 1) return layout(initial, (depth || 0) + 1, settled);
    }
    // banner sits just under the center node
    var cEl = S.nodes[centerId].el.firstElementChild;
    var b = $('#knowBanner'); b.style.top = (cy + cEl.offsetHeight / 2 + 14) + 'px';
    buildLinks();
    animate();
  }

  // Nudge targets apart so no two cards overlap, whatever the screen size or answer length.
  function relax(W, H, centerId) {
    var ids = Object.keys(S.nodes), box = {};
    ids.forEach(function (id) { var e = S.nodes[id].el.firstElementChild, k = id === centerId && id !== 'idea' ? 1.07 : 1; box[id] = { w: e.offsetWidth * k / 2 + 5, h: e.offsetHeight * k / 2 + 5 }; S.nodes[id].box = { w: e.offsetWidth / 2, h: e.offsetHeight / 2 }; });
    for (var it = 0; it < 90; it++) {
      var moved = false;
      for (var i = 0; i < ids.length; i++) for (var j = i + 1; j < ids.length; j++) {
        var a = S.nodes[ids[i]], b = S.nodes[ids[j]], A = box[ids[i]], B = box[ids[j]];
        var dx = b.tx - a.tx, dy = b.ty - a.ty;
        var ox = A.w + B.w - Math.abs(dx), oy = A.h + B.h - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          moved = true;
          var horiz = it < 30 ? ox < oy : (it % 2 ? ox >= oy : ox < oy), amt = (horiz ? ox : oy) / 2 + 0.5, sx = dx >= 0 ? 1 : -1, sy = dy >= 0 ? 1 : -1;
          var aw = ids[i] === centerId ? 0 : 1, bw = ids[j] === centerId ? 0 : 1, tot = (aw + bw) || 1;
          if (horiz) { a.tx -= sx * amt * 2 * aw / tot; b.tx += sx * amt * 2 * bw / tot; }
          else { a.ty -= sy * amt * 2 * aw / tot; b.ty += sy * amt * 2 * bw / tot; }
        }
      }
      ids.forEach(function (id) { var n = S.nodes[id], bx = box[id];
        n.tx = Math.max(bx.w - 3, Math.min(W - bx.w + 3, n.tx)); n.ty = Math.max(bx.h - 3, Math.min(H - bx.h + 3, n.ty)); });
      if (!moved) return false;
    }
    return moved;
  }

  var raf = null;
  function animate() {
    if (raf) cancelAnimationFrame(raf);
    var step = function () {
      if (!S) return;
      var moving = false;
      Object.keys(S.nodes).forEach(function (id) {
        var n = S.nodes[id], k = reduce ? 1 : 0.13;
        var dx = n.tx - n.x, dy = n.ty - n.y;
        if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) { n.x += dx * k; n.y += dy * k; moving = true; } else { n.x = n.tx; n.y = n.ty; }
        place(n);
      });
      drawLinks();
      raf = moving ? requestAnimationFrame(step) : null;
    };
    raf = requestAnimationFrame(step);
  }

  var NS = 'http://www.w3.org/2000/svg';
  function buildLinks() {
    var sp = $('#spokes'), ar = $('#arcs'); if (!sp) return;
    var centerId = S.view || 'idea';
    sp.innerHTML = ''; ar.innerHTML = '';
    Object.keys(S.nodes).forEach(function (id) {
      if (id === centerId) return;
      var on = id === 'idea' || S.answers[id];
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('pathLength', '1');
      p.setAttribute('class', 'spoke ' + (on ? 'on' : 'idle'));
      var col = id === 'idea' ? GOLD : BY_ID[id].color;
      if (on) p.setAttribute('stroke', col);
      if (on) addTrail(sp, centerId, id, col, false, !!S.drawn['s-' + centerId + id]);
      if (on && S.drawn['s-' + centerId + id]) p.style.animation = 'none', p.style.strokeDashoffset = '0';
      if (on) S.drawn['s-' + centerId + id] = 1;
      p.dataset.a = centerId; p.dataset.b = id;
      sp.appendChild(p);
    });
    CHAIN.forEach(function (c) {
      if (!S.answers[c[0]] || !S.answers[c[1]]) return;
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('pathLength', '1'); p.setAttribute('class', 'arc');
      p.setAttribute('stroke', BY_ID[c[0]].color);
      p.dataset.a = c[0]; p.dataset.b = c[1]; p.dataset.arc = '1';
      var key = 'a-' + c[0] + c[1];
      addTrail(ar, c[0], c[1], BY_ID[c[0]].color, true, !!S.drawn[key]);
      var t = document.createElementNS(NS, 'text');
      t.setAttribute('class', 'arc-label'); t.setAttribute('text-anchor', 'middle'); t.textContent = c[2];
      if (S.drawn[key]) { p.style.animation = 'none'; p.style.strokeDashoffset = '0'; t.style.animation = 'none'; t.style.opacity = '1'; }
      S.drawn[key] = 1;
      p._label = t;
      ar.appendChild(p); ar.appendChild(t);
    });
    drawLinks();
  }

  // each lit link gets a soft glow under it and a small light that travels along it
  function addTrail(parent, a, b, col, arc, drawn) {
    ['glow', 'trail'].forEach(function (k) {
      var t = document.createElementNS(NS, 'path');
      t.setAttribute('pathLength', '1'); t.setAttribute('class', k + (arc && k === 'trail' ? ' arc-t' : '')); t.setAttribute('stroke', col);
      t.dataset.a = a; t.dataset.b = b; if (arc) t.dataset.arc = '1';
      if (drawn && k === 'glow') { t.style.animation = 'none'; t.style.opacity = '.13'; }
      if (k === 'trail') t.style.animationDelay = (0.9 + Math.random() * 2.2).toFixed(2) + 's';
      parent.insertBefore(t, parent.firstChild);
    });
  }
  // a label that would sit on top of a card moves along its curve, or steps aside
  function labelSpot(a, q, b) {
    var ts = [0.5, 0.38, 0.62, 0.3, 0.7];
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i], u = 1 - t, x = u * u * a.x + 2 * u * t * q[0] + t * t * b.x, y = u * u * a.y + 2 * u * t * q[1] + t * t * b.y;
      if (!hitsNode(x, y)) return [x, y];
    }
    return null;
  }
  function hitsNode(x, y) {
    for (var id in S.nodes) { var n = S.nodes[id], bx = n.box; if (!bx) continue;
      if (Math.abs(x - n.x) < bx.w + 26 && Math.abs(y - n.y) < bx.h + 8) return true; }
    return false;
  }

  function drawLinks() {
    var st = stageSize(), cx = st.w / 2, cy = st.h / 2;
    var all = document.querySelectorAll('#links path');
    for (var i = 0; i < all.length; i++) {
      var p = all[i], a = S.nodes[p.dataset.a], b = S.nodes[p.dataset.b];
      if (!a || !b) continue;
      var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (p.dataset.arc) {
        var ox = mx - cx, oy = my - cy, len = Math.hypot(ox, oy) || 1, ch = Math.hypot(b.x - a.x, b.y - a.y);
        var bend = ch * 0.18;
        var qx = mx + ox / len * bend, qy = my + oy / len * bend;
        p.setAttribute('d', 'M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + ' Q' + qx.toFixed(1) + ' ' + qy.toFixed(1) + ' ' + b.x.toFixed(1) + ' ' + b.y.toFixed(1));
        if (p._label) {
          var spot = labelSpot(a, [qx, qy], b);
          p._label.classList.toggle('hide', !spot);
          if (spot) { p._label.setAttribute('x', spot[0].toFixed(1)); p._label.setAttribute('y', (spot[1] + 4).toFixed(1)); }
        }
      } else {
        // gentle curve for spokes
        var nx = -(b.y - a.y) * 0.06, ny = (b.x - a.x) * 0.06;
        p.setAttribute('d', 'M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + ' Q' + (mx + nx).toFixed(1) + ' ' + (my + ny).toFixed(1) + ' ' + b.x.toFixed(1) + ' ' + b.y.toFixed(1));
      }
    }
  }

  function refreshNodes() {
    var c = S.ctx;
    LENSES.forEach(function (l) {
      var n = S.nodes[l.id], el = n.el, a = S.answers[l.id];
      var q = E.questionFor(c, l.id, S.answers).question;
      el.querySelector('.q').textContent = q.length <= 46 ? q : SHORT[l.id];
      var shown = a ? E.tidy(a.text, keepCaps()) : '';
      el.querySelector('.ans').textContent = shown;
      el.classList.toggle('long', shown.length > 38);
      el.querySelector('.own').textContent = a ? (a.src === 'typed' ? '\u270E your words' : '\u2713 your choice') : '';
      el.classList.toggle('done', !!a);
      el.classList.toggle('skipped', !a && !!S.skipped[l.id]);
      el.classList.toggle('active', S.current === l.id && S.phase === 'q');
      var rfText = S.view && l.id !== S.view ? E.reframe(c, S.view, l.id, a && a.text, S.answers) : null;
      el.querySelector('.rf').textContent = rfText || '';
      el.classList.toggle('reframed', !!rfText);
      el.querySelector('button').setAttribute('aria-label', l.name + ' lens: ' + (a ? 'you decided ' + a.text : 'not explored yet. ' + q));
    });
    var ideaEl = S.nodes.idea.el;
    var old = ideaEl.querySelector('.rf'); if (old) old.remove();
    if (S.view) {
      var t = E.reframe(c, S.view, 'idea', null, S.answers);
      if (t) { var d = document.createElement('div'); d.className = 'rf'; d.textContent = t; ideaEl.firstElementChild.appendChild(d); }
    }
    // screen-reader version of the map
    var sr = $('#srMap'); sr.innerHTML = '';
    var li = document.createElement('li'); li.textContent = 'Idea: ' + c.idea; sr.appendChild(li);
    LENSES.forEach(function (l) { if (S.answers[l.id]) { var x = document.createElement('li'); x.textContent = l.name + ': ' + S.answers[l.id].text; sr.appendChild(x); } });
  }

  function keepCaps() { var k = {}, r = S && S.answers.character && E.nameFrom(S.answers.character.text); if (r) k[r] = 1; if (S && S.ctx.name) k[S.ctx.name] = 1; return k; }

  /* ---------------- flow ---------------- */
  function doneCount() { return Object.keys(S.answers).length; }
  function handled(id) { return S.answers[id] || S.skipped[id]; }
  function nextLens() {
    var start = S.current ? LENSES.findIndex(function (l) { return l.id === S.current; }) : -1;
    for (var i = 1; i <= LENSES.length; i++) { var l = LENSES[(start + i + LENSES.length) % LENSES.length]; if (!handled(l.id)) return l.id; }
    return null;
  }

  function answer(lensId, text, src) {
    text = (text || '').trim().replace(/\s+/g, ' ');
    if (!text) return;
    S.answers[lensId] = { text: text.slice(0, 120), src: src };
    delete S.skipped[lensId];
    var el = S.nodes[lensId].el;
    el.classList.add('just'); setTimeout(function () { el.classList.remove('just'); }, 950);
    var n = S.nodes[lensId]; ripple(n.x, n.y, BY_ID[lensId].glow); Sound.play('land');
    afterStep(lensId);
  }
  function skip(lensId) { S.skipped[lensId] = 1; afterStep(lensId); }

  function afterStep(lensId) {
    S.current = lensId;
    var nx = nextLens();
    var first3 = !S.knowShown && doneCount() >= 3;
    if (first3) {
      S.knowShown = true; S.phase = 'know';
      setTimeout(function () { if (!S) return; $('#knowBanner').classList.add('show'); flare(); Sound.play('swell'); }, reduce ? 0 : 650);
    } else if (!nx) {
      S.phase = 'complete';
      $('#knowBanner').classList.add('show'); setTimeout(function () { if (S) { flare(); Sound.play('swell'); } }, reduce ? 0 : 650);
      if (!S.revealShown && canReveal()) { var s0 = S; setTimeout(function () { if (S === s0 && !S.revealShown) openReveal(true); }, reduce ? 300 : 1500); }
    } else if (S.view && S.view === lensId) {
      S.phase = 'view';
    } else {
      S.phase = 'q';
    }
    S.current = nx;
    if (S.phase === 'q' && nx && !reduce) setTimeout(function () { if (S && S.current === nx) Sound.play('chime', LENSES.indexOf(BY_ID[nx]), true); }, 420);
    refreshNodes(); layout(); renderPanel();
  }

  function jumpTo(id) {
    S.current = id; S.phase = 'q';
    refreshNodes(); renderPanel();
  }

  function cycleView() {
    var order = LENSES.map(function (l) { return l.id; });
    var next = !S.view ? 'perspective' : order[(order.indexOf(S.view) + 1) % order.length];
    setView(next);
  }
  function setView(v) {
    S.view = v;
    Sound.play('whoosh');
    var st0 = stageSize(), stEl = $('#stage');
    if (!reduce) { stEl.classList.add('reorient'); setTimeout(function () { stEl.classList.remove('reorient'); }, 380); }
    ripple(st0.w / 2, st0.h / 2, v ? BY_ID[v].glow : '#D1A954', true);
    document.body.classList.toggle('view-lens', !!v);
    var vt = $('#viewTag');
    if (v) {
      var L = BY_ID[v];
      document.body.style.setProperty('--view-tint', L.tint); document.body.style.setProperty('--view-glow', L.glow); document.body.style.setProperty('--view-c', L.color);
      vt.hidden = false; vt.style.color = L.color; vt.innerHTML = icon(v) + 'Seen through ' + L.name;
      if (!S.answers[v]) { S.current = v; S.phase = 'q'; } else S.phase = 'view';
    } else {
      vt.hidden = true; ['--view-tint', '--view-glow', '--view-c'].forEach(function (k) { document.body.style.removeProperty(k); });
      S.current = nextLens() || S.current;
      S.phase = S.current && !handled(S.current) ? 'q' : 'complete';
    }
    refreshNodes(); layout(); renderPanel();
  }

  /* ---------------- panel ---------------- */
  function swapPanel(html, focusSel) {
    var p = $('#panelInner');
    p.classList.add('swap');
    setTimeout(function () {
      p.innerHTML = html; p.classList.remove('swap'); wirePanel();
      var first = p.firstElementChild; p.style.setProperty('--pg', (first && first.style.getPropertyValue('--c')) || '#D1A954');
      var pan = $('#panel'); if (pan.scrollHeight > pan.clientHeight) pan.scrollTop = 0;
      var f = focusSel && p.querySelector(focusSel);
      if (f) f.focus({ preventScroll: window.innerWidth < 980 });
    }, reduce ? 0 : 170);
  }

  function progressBar() {
    return '<div class="progress" aria-hidden="true">' + LENSES.map(function (l) {
      return '<span style="--c:' + l.color + '" class="' + (S.answers[l.id] ? 'd' : S.current === l.id ? 'a' : '') + '"></span>';
    }).join('') + '</div>';
  }
  function lensCta() {
    return '<button type="button" class="lens-cta appear" data-act="lens">' + icon('perspective') + 'SEE IT THROUGH ANOTHER LENS</button>';
  }
  function teachCta() {
    return (S.ctx.mode === 'teacher' && doneCount() >= 4) ? '<button type="button" class="ghost-btn teach-cta" data-act="plan">Turn this into a learning experience</button>' : '';
  }
  function answerList() {
    return '<ul>' + LENSES.filter(function (l) { return S.answers[l.id]; }).map(function (l) {
      return '<li style="--c:' + l.color + '"><b>' + l.name + '</b><span>' + esc(S.answers[l.id].text) + '</span></li>';
    }).join('') + '</ul>';
  }

  function renderPanel() {
    var ph = S.phase;
    if (ph === 'q' && S.current) return swapPanel(questionHtml(S.current), '#ansInput');
    if (ph === 'know') {
      var nx = S.current;
      return swapPanel('<div class="know"><div class="asks"><span class="dot"></span>STORIGEN noticed</div>' +
        '<h2 id="qText">Look what you already know.</h2><p>' + (S.ctx.mode === 'teacher' ? 'Three moves in, and your topic already has a structure students can follow.' : 'Three answers in, and your idea already has a shape. STORIGEN only asked. Every word on the map is yours.') + '</p>' +
        answerList() + lensCta() +
        (nx ? '<button type="button" class="ghost-btn" data-act="continue">Keep going: ' + BY_ID[nx].name + '</button>' : '') + teachCta() + '</div>', '.lens-cta');
    }
    if (ph === 'complete') {
      var typed = LENSES.filter(function (l) { return S.answers[l.id] && S.answers[l.id].src === 'typed'; }).length;
      return swapPanel('<div class="know"><div class="asks"><span class="dot"></span>Your thinking map is complete</div>' +
        '<h2 id="qText">Look what you already know.</h2><p>' + (S.ctx.mode === 'teacher' ? 'Same engine students use, pointed at your content.' : 'STORIGEN didn\u2019t write this. You did. It helped you see your thinking.') + '</p>' +
        answerList() +
        '<div class="tally"><div><strong>' + LENSES.length + '</strong>questions asked</div><div><strong>' + doneCount() + '</strong>decisions you made</div><div><strong>' + typed + '</strong>in your own words</div></div>' +
        builtCta() + lensCta() + teachCta() + '<button type="button" class="ghost-btn" data-act="print">Print my map</button><button type="button" class="ghost-btn" data-act="new">Start a new idea</button></div>', '.lens-cta');
    }
    if (ph === 'view') return swapPanel(viewHtml(), '.lens-cta');
    // fallback
    S.phase = 'complete'; renderPanel();
  }

  function questionHtml(id) {
    var L = BY_ID[id], q = E.questionFor(S.ctx, id, S.answers), idx = LENSES.indexOf(L) + 1;
    var viewing = S.view === id ? '<p class="view-note" style="color:' + L.color + ';font-weight:700;margin:0 0 10px">You\u2019re looking through ' + L.name + ' now. Answer it to see the map change.</p>' : '';
    var cur = S.answers[id];
    return '<div style="--c:' + L.color + ';--t:' + L.tint + ';--g:' + L.glow + '">' + viewing +
      '<div class="asks"><span class="dot"></span>STORIGEN asks<span class="ai">AI</span><span class="step">Lens ' + idx + ' of 7</span></div>' +
      '<span class="lens-badge">' + icon(id) + L.name + '</span>' +
      '<h2 class="qtext" id="qText" aria-live="polite">' + esc(q.question) + '</h2>' +
      (q.hint ? '<p class="hint">' + esc(q.hint) + '</p>' : '') +
      '<form class="ans-form" data-lens="' + id + '" autocomplete="off"><label for="ansInput" class="sr">Your answer. One word is enough.</label>' +
      '<div class="ans-row"><input id="ansInput" type="text" maxlength="120" placeholder="One word is fine" value="' + (cur ? esc(cur.text) : '') + '">' +
      '<button class="add" type="submit">Add to my map</button></div></form>' +
      '<p class="chips-label" id="chipsLabel">Possibilities. Pick one, change it, or use your own words.</p>' +
      '<div class="chips" role="group" aria-labelledby="chipsLabel">' + q.chips.map(function (c) { return '<button type="button" class="chip" data-chip="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div>' +
      '<button type="button" class="skip-lens" data-act="skip">Not sure yet. Skip this lens</button>' +
      '<p class="why">' + esc(q.why) + '</p>' + progressBar() +
      (S.knowShown ? lensCta().replace(' appear', '') : '') + builtCta(true) + teachCta() +
      (S.view ? '<button type="button" class="ghost-btn" data-act="back">Back to my idea</button>' : '') + '</div>';
  }

  function viewHtml() {
    var L = BY_ID[S.view];
    var items = [];
    var it = E.reframe(S.ctx, S.view, 'idea', null, S.answers);
    if (it) items.push({ c: GOLD, t: 'rgba(209,169,84,.14)', n: S.ctx.mode === 'teacher' ? 'Your topic' : 'Your idea', q: it, said: null });
    LENSES.forEach(function (l) {
      if (l.id === S.view || !S.answers[l.id]) return;
      var r = E.reframe(S.ctx, S.view, l.id, S.answers[l.id].text, S.answers);
      if (r) items.push({ c: l.color, t: l.tint, n: l.name, q: r, said: E.tidy(S.answers[l.id].text, keepCaps()) });
    });
    var more = nextLens();
    return '<div style="--c:' + L.color + ';--t:' + L.tint + ';--g:' + L.glow + '">' +
      '<div class="asks"><span class="dot"></span>Seen through ' + L.name + '</div>' +
      '<span class="lens-badge">' + icon(S.view) + L.name + '</span>' + (S.answers[S.view] ? '<p class="view-said">Your ' + L.name.toLowerCase() + ': ' + esc(E.tidy(S.answers[S.view].text, keepCaps())) + '</p>' : '') +
      '<h2 class="qtext" id="qText" aria-live="polite">Same idea. New view.</h2>' +
      '<p class="view-note">You didn\u2019t change a single answer. Looking through ' + L.name + ' turns each one into a new question only you can answer:</p>' +
      '<ul class="view-list">' + items.map(function (x) { return '<li style="--c:' + x.c + ';--t:' + x.t + '"><small>' + esc(x.n) + '</small><span class="rq">' + esc(x.q) + '</span>' + (x.said ? '<span class="said">You said: ' + esc(x.said) + '</span>' : '') + '</li>'; }).join('') + '</ul>' +
      lensCta() + builtCta(true) + teachCta() +
      '<button type="button" class="ghost-btn" data-act="back">Back to my idea</button>' +
      (more ? '<button type="button" class="ghost-btn" data-act="continue" style="border-color:transparent;text-decoration:underline">Keep answering: ' + BY_ID[more].name + '</button>' : '') + '</div>';
  }

  function wirePanel() {
    var p = $('#panelInner');
    var form = p.querySelector('.ans-form');
    if (form) {
      var inp = form.querySelector('input'), add = form.querySelector('.add');
      var sync = function () { add.disabled = !inp.value.trim(); };
      inp.addEventListener('input', sync); sync();
      form.addEventListener('submit', function (e) { e.preventDefault(); if (inp.value.trim() && !form.dataset.busy) { form.dataset.busy = '1'; answer(form.dataset.lens, inp.value, 'typed'); } });
      p.querySelectorAll('.chip').forEach(function (b) {
        b.addEventListener('click', function () {
          if (form.dataset.busy) return; form.dataset.busy = '1'; b.classList.add('picked');
          setTimeout(function () { answer(form.dataset.lens, b.dataset.chip, 'chosen'); }, reduce ? 0 : 170);
        });
      });
    }
    p.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.dataset.act;
        if (a === 'lens') { cycleView(); if (window.innerWidth <= 980) window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); }
        else if (a === 'skip') skip(form.dataset.lens);
        else if (a === 'continue') { if (!S.current || handled(S.current)) S.current = nextLens(); S.phase = 'q'; refreshNodes(); renderPanel(); }
        else if (a === 'back') { setView(null); if (window.innerWidth <= 980) window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); }
        else if (a === 'new') $('#restart').click();
        else if (a === 'plan') openPlan();
        else if (a === 'built') openReveal(true);
        else if (a === 'print') window.print();
      });
    });
  }

  /* ---------------- the payoff: "Your story, in your words" ---------------- */
  function allHandled() { return LENSES.every(function (l) { return handled(l.id); }); }
  function canReveal() { return S && (doneCount() >= 5 || (allHandled() && doneCount() >= 3)); }
  function builtLabel() { return S.ctx.mode === 'teacher' ? 'See your learning experience' : S.ctx.mode === 'story' ? 'See what you built' : 'See your thinking'; }
  function builtCta(small) { return canReveal() ? '<button type="button" class="built-cta' + (small ? ' small' : '') + '" data-act="built"><span class="spark" aria-hidden="true"></span>' + builtLabel() + '</button>' : ''; }
  function segHtml(segs) {
    return segs.map(function (g) {
      if (g.step) return '<span class="rv-step">' + esc(g.t) + '</span>';
      if (!g.own) return '<span class="fw">' + esc(g.t) + '</span>';
      var L = BY_ID[g.own], nm = L ? L.name : (S.ctx.mode === 'teacher' ? 'Topic' : 'Idea');
      return '<mark class="own' + (g.added ? ' added' + (S.justAdded === g.added ? ' fresh' : '') : '') + '" data-lens="' + g.own + '" style="--c:' + (L ? L.color : GOLD) + '" title="Your words \u00B7 ' + nm + '">' + esc(g.t) + '</mark>';
    }).join('');
  }
  function lensDots(ids) { return ids.map(function (id) { var L = BY_ID[id]; return L ? '<span class="rv-dot" style="--c:' + L.color + '" title="' + L.name + '">' + icon(id) + '</span>' : '<span class="rv-dot" style="--c:' + GOLD + '" title="Your idea">' + icon('idea') + '</span>'; }).join(''); }
  function insightHtml(ins) {
    if (S.ctx.mode !== 'story') return '';
    var row = function (x, kind) { return '<li class="rv-ins ' + kind + '"><span class="rv-ins-l">' + lensDots(x.lenses) + '</span><p>' + esc(x.text) + '</p></li>'; };
    return '<section class="rv-tell" aria-labelledby="rvTellH"><h3 id="rvTellH"><span class="dot"></span>What your story is telling you</h3>' +
      (ins.connections.length ? '<p class="rv-sub">Connections</p><ul class="rv-list">' + ins.connections.slice(0, 3).map(function (x) { return row(x, 'conn'); }).join('') + '</ul>' : '') +
      (ins.tensions.length ? '<p class="rv-sub">Tensions and gaps</p><ul class="rv-list">' + ins.tensions.slice(0, 3).map(function (x) { return row(x, 'tens'); }).join('') + '</ul>' : '') +
      (ins.next.length ? '<p class="rv-sub rv-sub-next">Your next move <span>Tap one to answer. Your story grows as you do.</span></p><div class="rv-next">' + ins.next.map(function (n) {
        var L = BY_ID[n.lens];
        return '<div class="rv-move" style="--c:' + L.color + ';--t:' + L.tint + '"><button type="button" class="rv-q" data-slot="' + n.slot + '" aria-expanded="false">' + icon(n.lens) + '<span>' + esc(n.q) + '</span></button>' +
          '<form class="rv-qform" data-slot="' + n.slot + '" hidden autocomplete="off"><label class="sr" for="mv-' + n.slot + '">' + esc(n.q) + '</label><input id="mv-' + n.slot + '" type="text" maxlength="120" placeholder="' + esc(n.ph) + '"><button type="submit" class="add" disabled>Add to my story</button></form></div>';
      }).join('') + '</div>' : '<p class="rv-sub">Every next move is answered. This story is yours to write now.</p>') +
      '</section>';
  }
  function exitHtml(sp) {
    var top = (sp.logline.filter(function (g) { return g.own === 'idea'; })[0] || {}).t, ex = sp.exit, i = top ? ex.toLowerCase().indexOf(top.toLowerCase()) : -1;
    if (i < 0) return '<span class="fw">' + esc(ex) + '</span>';
    return segHtml([{ t: ex.slice(0, i) }, { t: ex.slice(i, i + top.length), own: 'idea' }, { t: ex.slice(i + top.length) }]);
  }
  function revealHtml() {
    var sp = E.spine(S.ctx, S.answers, keepCaps(), S.extra), ins = E.insights(S.ctx, S.answers, keepCaps(), S.extra);
    S.sp = sp;
    var acts = sp.acts.map(function (a, i) {
      var stg = ins.strength[a.id];
      return '<article class="rv-act" data-act-id="' + a.id + '" style="--i:' + i + '"><header><span class="rv-num">' + (i + 1) + '</span><h3>' + esc(a.label) + '</h3><span class="rv-lenses">' + lensDots(a.lenses) + '</span></header>' +
        a.lines.map(function (l) { return '<p class="rv-line">' + segHtml(l) + '</p>'; }).join('') +
        (stg ? '<div class="rv-strength" style="--p:' + stg.pct + '" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + stg.pct + '" aria-label="' + esc(a.label) + ' strength: ' + stg.label + '"><span class="bar"><i></i></span><b>' + stg.label + '</b></div>' : '') +
        (sp.kind === 'lesson' && a.id === 'turn' ? '<p class="rv-line rv-exit">' + exitHtml(sp) + '</p>' : '') + '</article>';
    }).join('');
    var first = S.firstLine ? '<figure class="rv-first"><figcaption>' + (sp.kind === 'lesson' ? 'Your opening hook' : sp.kind === 'thinking' ? 'In your own words' : 'Your first line') + '</figcaption><blockquote><mark class="own" style="--c:' + GOLD + '" title="Your words">' + esc(S.firstLine) + '</mark></blockquote></figure>' : '';
    return '<div class="rv-wrap">' +
      '<p class="rv-eyebrow"><span class="dot"></span>' + esc(sp.eyebrow) + '</p>' +
      '<h2 id="rvTitle" tabindex="-1">' + esc(sp.title) + '</h2>' +
      '<p class="rv-logline" id="rvLogline">' + segHtml(sp.logline) + '</p>' +
      '<p class="rv-legend"><mark class="own sample" style="--c:' + GOLD + '">Underlined</mark> words are yours, exactly as you chose them. <span class="fw">Grey words</span> only join them together.</p>' +
      '<div class="rv-acts">' + acts + '</div>' + insightHtml(ins) +
      '<div id="rvFirst">' + first + '</div>' +
      '<form id="firstForm" class="rv-firstform" hidden autocomplete="off"><label for="firstLine">' + esc(sp.firstLabel) + '</label><p class="rv-seed">' + esc(sp.seed) + '</p>' +
      '<textarea id="firstLine" rows="3" maxlength="400" placeholder="Type it your way. STORIGEN won\u2019t write it for you."></textarea><button type="submit" class="add" disabled>Add it to my story</button></form>' +
      '<div class="rv-actions">' +
      '<button type="button" class="rv-primary" data-rv="write">' + icon('character').replace('class="ic"', 'class="ic"') + (S.firstLine ? 'Edit my ' + (sp.kind === 'lesson' ? 'hook' : sp.kind === 'thinking' && S.ctx.mode === 'problem' ? 'first step' : 'first line') : esc(sp.firstLabel)) + '</button>' +
      '<button type="button" class="rv-ghost" data-rv="print">Print / save my story map</button>' +
      '<button type="button" class="rv-ghost rv-lens" data-rv="lens">' + icon('perspective') + 'See it through another lens</button>' +
      (sp.kind === 'lesson' ? '<button type="button" class="rv-ghost" data-rv="plan">Open the 7-step plan</button>' : '') +
      '<button type="button" class="rv-ghost" data-rv="map">Back to my map</button>' +
      '<button type="button" class="rv-ghost" data-rv="new">Start a new idea</button></div>' +
      '<p class="rv-closing"><span class="dot"></span>' + esc(sp.closing) + '</p></div>';
  }
  function renderReveal() {
    var inner = $('#rvInner'); inner.innerHTML = revealHtml(); wireReveal();
    S.justAdded = null;
  }
  function openReveal(cinematic) {
    if (!S || !canReveal()) return;
    S.revealShown = true;
    var rv = $('#reveal');
    renderReveal();
    rv.hidden = false; rv.scrollTop = 0;
    document.body.classList.add('revealed');
    $('#main').inert = true;
    Sound.play('reveal');
    var marks = [].slice.call(rv.querySelectorAll('mark.own:not(.sample)'));
    if (cinematic && !reduce) {
      rv.classList.add('arriving'); marks.forEach(function (m) { m.classList.add('pending'); });
      var ids = ['idea'].concat(LENSES.map(function (l) { return l.id; }).filter(function (id) { return S.answers[id]; }));
      var layer = $('#ghosts'); layer.innerHTML = '';
      ids.forEach(function (id, i) {
        var src = S.nodes[id].el.querySelector('.inner'); if (!src) return;
        var a = src.getBoundingClientRect();
        var targets = marks.filter(function (m) { return m.dataset.lens === id; });
        var tg = targets[0] || rv.querySelector('.rv-acts');
        var b = tg.getBoundingClientRect();
        var g = document.createElement('div'); g.className = 'rv-fly';
        var L = BY_ID[id]; g.style.setProperty('--c', L ? L.color : GOLD); g.style.setProperty('--g', L ? L.glow : GOLD);
        g.textContent = id === 'idea' ? S.ctx.idea : E.tidy(S.answers[id].text, keepCaps());
        g.style.left = a.left + 'px'; g.style.top = a.top + 'px'; g.style.width = a.width + 'px'; g.style.minHeight = a.height + 'px';
        layer.appendChild(g);
        var dx = b.left + Math.min(b.width, 260) / 2 - (a.left + a.width / 2), dy = Math.min(b.top + b.height / 2, window.innerHeight + 60) - (a.top + a.height / 2);
        var delay = 120 + i * 80, dur = 900;
        var an = g.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1, filter: 'blur(0)' }, { transform: 'translate(' + dx * 0.55 + 'px,' + (dy * 0.45 - 40) + 'px) scale(.8)', opacity: 1, offset: 0.55 },
          { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.35)', opacity: 0, filter: 'blur(2px)' }], { duration: dur, delay: delay, easing: 'cubic-bezier(.55,0,.25,1)', fill: 'both' });
        setTimeout(function () { targets.forEach(function (m) { m.classList.remove('pending'); m.classList.add('lit'); }); }, delay + dur * 0.85);
        an.onfinish = function () { g.remove(); };
      });
      setTimeout(function () { rv.classList.remove('arriving'); marks.forEach(function (m) { m.classList.remove('pending'); }); layer.innerHTML = ''; }, 120 + ids.length * 80 + 1100);
    }
    setTimeout(function () { var t = $('#rvTitle'); if (t) t.focus({ preventScroll: true }); }, reduce ? 0 : 60);
  }
  function closeReveal() {
    var rv = $('#reveal'); if (rv.hidden) return;
    rv.hidden = true; document.body.classList.remove('revealed'); $('#main').inert = false; $('#ghosts').innerHTML = '';
    var b = document.querySelector('[data-act="built"]'); if (b) b.focus({ preventScroll: true });
  }
  function wireReveal() {
    var rv = $('#reveal');
    rv.querySelectorAll('[data-rv]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.dataset.rv;
        if (a === 'map') closeReveal();
        else if (a === 'lens') { closeReveal(); cycleView(); window.scrollTo({ top: 0 }); }
        else if (a === 'new') { closeReveal(); $('#restart').click(); }
        else if (a === 'plan') { closeReveal(); openPlan(); }
        else if (a === 'print') window.print();
        else if (a === 'write') { var f = $('#firstForm'); f.hidden = false; var ta = $('#firstLine'); ta.value = S.firstLine || ''; ta.dispatchEvent(new Event('input')); ta.focus(); f.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); }
      });
    });
    var ff = $('#firstForm'), ta = $('#firstLine'), fb = ff.querySelector('.add');
    ta.addEventListener('input', function () { fb.disabled = !ta.value.trim(); });
    ff.addEventListener('submit', function (e) {
      e.preventDefault(); var v = ta.value.trim().replace(/\s+/g, ' '); if (!v) return;
      S.firstLine = v; Sound.play('land'); renderReveal();
      var fig = $('#rvFirst .rv-first'); if (fig) { fig.classList.add('fresh'); fig.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); }
      var w = rv.querySelector('[data-rv="write"]'); if (w) w.focus({ preventScroll: true });
    });
    rv.querySelectorAll('.rv-q').forEach(function (b) {
      b.addEventListener('click', function () {
        var f = b.nextElementSibling, open = f.hidden; f.hidden = !open; b.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) f.querySelector('input').focus();
      });
    });
    rv.querySelectorAll('.rv-qform').forEach(function (f) {
      var inp = f.querySelector('input'), add = f.querySelector('.add');
      inp.addEventListener('input', function () { add.disabled = !inp.value.trim(); });
      f.addEventListener('submit', function (e) {
        e.preventDefault(); var v = inp.value.trim().replace(/\s+/g, ' '); if (!v) return;
        var slot = f.dataset.slot, y = rv.scrollTop;
        S.extra[slot] = v.slice(0, 120); S.justAdded = slot; Sound.play('land');
        renderReveal(); rv.scrollTop = y;
        var m = rv.querySelector('mark.added.fresh');
        if (m) { m.closest('.rv-act').classList.add('grew'); m.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); }
        var live = $('#rvLive'); live.textContent = 'Added to your story: ' + v;
      });
    });
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('#reveal').hidden && $('#planModal').hidden) closeReveal(); });

  /* ---------------- teacher: learning experience ---------------- */
  function openPlan() {
    var plan = E.lessonPlan(S.ctx, S.answers);
    var card = $('#planCard');
    card.innerHTML = '<div class="asks"><span class="dot"></span>Built from your map</div><h2 id="planTitle">' + esc(plan.title) + '</h2><p class="sub">' + esc(plan.sub) + '</p>' +
      '<ol class="plan">' + plan.steps.map(function (s, i) {
        var L = BY_ID[s.lens];
        return '<li style="--c:' + L.color + ';--t:' + L.tint + ';animation-delay:' + (i * 90) + 'ms"><span class="n">' + (i + 1) + '</span><div><div class="m">' + icon(s.lens) + esc(L.name) + ' \u00B7 ' + esc(s.move) + '</div><p>' + esc(s.text) + '</p></div></li>';
      }).join('') + '</ol>' +
      '<p class="plan-foot"><b>' + esc(plan.exit) + '</b><br>Students make the decisions. The teacher guides. STORIGEN only asks.</p>' +
      '<div class="modal-actions"><button type="button" class="ghost-btn" id="planCopy">Copy as text</button><button type="button" class="lens-cta" id="planClose" style="margin-top:10px">Back to the map</button></div>';
    var m = $('#planModal'); m.hidden = false;
    $('#planClose').focus({ preventScroll: true }); card.scrollTop = 0;
    $('#planClose').onclick = closePlan;
    $('#planCopy').onclick = function () {
      var txt = plan.title + '\n' + plan.sub + '\n\n' + plan.steps.map(function (s, i) { return (i + 1) + '. ' + BY_ID[s.lens].name + ': ' + s.move + '. ' + s.text; }).join('\n') + '\n\n' + plan.exit;
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { $('#planCopy').textContent = 'Copied'; }, function () { $('#planCopy').textContent = 'Copy not available'; });
    };
  }
  function closePlan() { $('#planModal').hidden = true; var b = document.querySelector('[data-act="plan"]'); if (b) b.focus(); }
  $('#planModal').addEventListener('click', function (e) { if (e.target.id === 'planModal') closePlan(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('#planModal').hidden) closePlan(); });

  if (window.ResizeObserver) { var lastW = 0, lastH = 0; new ResizeObserver(function (en) { var r = en[0].contentRect; if (S && (Math.abs(r.width - lastW) > 1 || Math.abs(r.height - lastH) > 1)) { lastW = r.width; lastH = r.height; layout(); } }).observe(document.getElementById('stage')); }
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (S) layout(); }, 120); });

  // Deep link: ?idea=... starts straight on the map (handy for sharing a specific example)
  var qp = new URLSearchParams(location.search).get('idea');
  if (qp) start(qp); else { $('#ideaInput').focus(); rotatePlaceholder(); }
  window.__storigen = { state: function () { return S; }, sound: Sound };
  var skyT; window.addEventListener('resize', function () { clearTimeout(skyT); skyT = setTimeout(paintSky, 200); });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  }
})();
