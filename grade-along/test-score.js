/* Grade Along — deterministic test scoring and approval rules.
   The model only reads marked answers. This file scores them against the key.
   Works in the browser (window.GA_testScore) and in Node tests (module.exports). */
(function (global) {
  var HIGH_CONFIDENCE = 0.8;
  var LETTERS = "ABCDE";
  var MAX_QUESTIONS = 50;
  var MAX_NAME = 100;
  var MAX_SHORT = 200;
  var MAX_ACCEPT = 8;

  function cleanStr(v, max) {
    return typeof v === "string" || typeof v === "number"
      ? String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max)
      : "";
  }

  function lettersFor(count) {
    var n = Number(count);
    if (!Number.isInteger(n) || n < 2) n = 4;
    if (n > 5) n = 5;
    return LETTERS.slice(0, n);
  }

  function normalizeShort(s) {
    return cleanStr(s, MAX_SHORT)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, MAX_SHORT);
  }

  function shortMatches(read, question) {
    var got = normalizeShort(read);
    if (!got) return false;
    var list = [];
    if (question && question.correct) list.push(question.correct);
    if (question && Array.isArray(question.acceptable)) {
      question.acceptable.forEach(function (a) { list.push(a); });
    }
    return list.some(function (a) { return normalizeShort(a) && normalizeShort(a) === got; });
  }

  function fail(msg) {
    var e = new Error(msg);
    e.answerKey = true;
    throw e;
  }

  function normalizeKey(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("This is not an answer key.");
    var name = cleanStr(raw.name, MAX_NAME).replace(/[\r\n]+/g, " ");
    if (!name) fail("The answer key needs a name.");
    var choiceCount = Number(raw.choiceCount != null ? raw.choiceCount : 4);
    var defaultLetters = lettersFor(choiceCount);
    var rows = Array.isArray(raw.questions) ? raw.questions : [];
    if (!rows.length) fail("An answer key needs at least one question.");
    if (rows.length > MAX_QUESTIONS) fail("An answer key can have at most 50 questions.");
    var questions = rows.map(function (q, i) {
      if (!q || typeof q !== "object") fail("Question " + (i + 1) + " is not valid.");
      var n = Number(q.n != null ? q.n : i + 1);
      if (!Number.isInteger(n) || n < 1) n = i + 1;
      var type = q.type === "short" ? "short" : "mc";
      var points = Number(q.points);
      if (!Number.isFinite(points) || points <= 0) points = 1;
      points = Math.round(points * 10) / 10;
      if (points > 100) points = 100;
      var prompt = cleanStr(q.prompt || q.title || "", 120);
      if (type === "short") {
        var correct = cleanStr(q.correct, MAX_SHORT);
        if (!correct) fail("Question " + n + " needs an expected answer.");
        var acceptable = Array.isArray(q.acceptable)
          ? q.acceptable.map(function (a) { return cleanStr(a, MAX_SHORT); }).filter(Boolean).slice(0, MAX_ACCEPT)
          : [];
        return { n: n, type: "short", points: points, prompt: prompt, correct: correct, acceptable: acceptable };
      }
      var choices = cleanStr(q.choices, 5).toUpperCase().replace(/[^A-E]/g, "") || defaultLetters;
      if (choices.length < 2) choices = defaultLetters;
      var ans = cleanStr(q.correct, 1).toUpperCase();
      if (!ans || choices.indexOf(ans) < 0) fail("Question " + n + " needs a correct choice from " + choices.split("").join(", ") + ".");
      return { n: n, type: "mc", points: points, prompt: prompt, choices: choices, correct: ans };
    });
    var id = typeof raw.id === "string" && /^[\w-]{1,60}$/.test(raw.id) ? raw.id : "";
    return { id: id, name: name, choiceCount: defaultLetters.length, questions: questions };
  }

  function keyShape(key) {
    var k = key && key.questions ? key : normalizeKey(key);
    return {
      name: k.name,
      questions: k.questions.map(function (q) {
        return q.type === "short"
          ? { n: q.n, type: "short", points: q.points, prompt: q.prompt }
          : { n: q.n, type: "mc", choices: q.choices, points: q.points, prompt: q.prompt };
      })
    };
  }

  function normalizeObs(raw) {
    var o = raw && typeof raw === "object" ? raw : {};
    var mark = o.mark === "blank" || o.mark === "multiple" || o.mark === "unclear" ? o.mark : "clear";
    var conf = Number(o.confidence);
    if (!Number.isFinite(conf)) conf = mark === "clear" ? 0 : 0;
    if (conf < 0) conf = 0;
    if (conf > 1) conf = 1;
    var read = o.read == null ? "" : String(o.read);
    return { n: Number(o.n) || 0, read: read, confidence: conf, mark: mark };
  }

  function scoreItem(question, observation) {
    var q = question;
    var obs = normalizeObs(observation);
    var out = {
      n: q.n,
      type: q.type,
      prompt: q.prompt || "",
      points: q.points,
      earned: 0,
      read: obs.read,
      confidence: obs.confidence,
      mark: obs.mark,
      expected: q.type === "mc" ? q.correct : "",
      correct: false,
      flagged: false,
      flagReason: "",
      autoApproved: false,
      reviewed: false
    };
    if (q.type === "short") {
      if (shortMatches(obs.read, q)) {
        out.correct = true;
        out.earned = q.points;
        out.autoApproved = true;
        out.flagged = false;
      } else {
        out.flagged = true;
        out.flagReason = !cleanStr(obs.read, MAX_SHORT) || obs.mark === "blank" ? "blank" : "short-answer";
        if (obs.mark === "unclear") out.flagReason = "unclear";
      }
      return out;
    }
    var letter = cleanStr(obs.read, 4).toUpperCase().replace(/[^A-E]/g, "");
    out.read = letter;
    if (obs.mark === "blank" || !letter) {
      out.mark = "blank";
      out.read = "";
      out.flagged = true;
      out.flagReason = "blank";
      return out;
    }
    if (obs.mark === "multiple" || letter.length > 1) {
      out.mark = "multiple";
      out.flagged = true;
      out.flagReason = "multiple";
      return out;
    }
    if (obs.mark === "unclear") {
      out.flagged = true;
      out.flagReason = "unclear";
      return out;
    }
    var match = letter === q.correct;
    var high = obs.confidence >= HIGH_CONFIDENCE;
    if (match && high) {
      out.correct = true;
      out.earned = q.points;
      out.autoApproved = true;
      return out;
    }
    if (!match && high) {
      // Clear wrong answer, high confidence: scored wrong, no approval needed, stays visible.
      out.correct = false;
      out.earned = 0;
      out.autoApproved = true;
      out.flagged = false;
      return out;
    }
    // Low confidence, even if the letters happen to match.
    out.flagged = true;
    out.flagReason = "low-confidence";
    if (match) {
      out.correct = true;
      out.earned = 0; // not credited until the teacher confirms the read
    }
    return out;
  }

  function scoreTest(key, observations, prior) {
    var k = key && key.questions ? key : normalizeKey(key);
    var byN = {};
    (Array.isArray(observations) ? observations : []).forEach(function (o) {
      var n = Number(o && o.n);
      if (n) byN[n] = o;
    });
    var priorByN = {};
    if (prior && Array.isArray(prior.items)) {
      prior.items.forEach(function (it) { if (it && it.n) priorByN[it.n] = it; });
    }
    var items = k.questions.map(function (q) {
      var scored = scoreItem(q, byN[q.n]);
      var prev = priorByN[q.n];
      if (prev && prev.reviewed) {
        // Teacher has already confirmed or overridden this item.
        var read = prev.read;
        scored.read = read;
        scored.reviewed = true;
        scored.flagged = false;
        scored.flagReason = "";
        scored.autoApproved = false;
        if (q.type === "short") {
          scored.correct = shortMatches(read, q);
        } else {
          var letter = cleanStr(read, 1).toUpperCase();
          scored.correct = letter === q.correct;
        }
        scored.earned = scored.correct ? q.points : 0;
      }
      return scored;
    });
    var earned = items.reduce(function (a, it) { return a + it.earned; }, 0);
    var points = items.reduce(function (a, it) { return a + it.points; }, 0);
    earned = Math.round(earned * 10) / 10;
    points = Math.round(points * 10) / 10;
    var flagged = items.filter(function (it) { return it.flagged; });
    return {
      items: items,
      earned: earned,
      points: points,
      percent: points ? Math.round((earned / points) * 1000) / 10 : 0,
      flaggedCount: flagged.length,
      finalized: flagged.length === 0,
      highConfidence: HIGH_CONFIDENCE
    };
  }

  function itemAnalysis(results) {
    var list = Array.isArray(results) ? results : [];
    var byN = {};
    list.forEach(function (res) {
      (res && res.items || []).forEach(function (it) {
        if (!byN[it.n]) byN[it.n] = { n: it.n, type: it.type, prompt: it.prompt || "", correct: 0, counted: 0, flagged: 0, points: it.points };
        var row = byN[it.n];
        // Count items that are auto-approved, reviewed, or otherwise finalized (not still flagged).
        if (it.flagged) row.flagged++;
        else {
          row.counted++;
          if (it.correct) row.correct++;
        }
      });
    });
    return Object.keys(byN).sort(function (a, b) { return Number(a) - Number(b); }).map(function (k) {
      var row = byN[k];
      return {
        n: row.n,
        type: row.type,
        prompt: row.prompt,
        points: row.points,
        counted: row.counted,
        correct: row.correct,
        flagged: row.flagged,
        percentCorrect: row.counted ? Math.round((row.correct / row.counted) * 1000) / 10 : null
      };
    });
  }

  var api = {
    HIGH_CONFIDENCE: HIGH_CONFIDENCE,
    LETTERS: LETTERS,
    MAX_QUESTIONS: MAX_QUESTIONS,
    normalizeKey: normalizeKey,
    keyShape: keyShape,
    normalizeShort: normalizeShort,
    shortMatches: shortMatches,
    scoreItem: scoreItem,
    scoreTest: scoreTest,
    itemAnalysis: itemAnalysis,
    lettersFor: lettersFor
  };
  global.GA_testScore = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
