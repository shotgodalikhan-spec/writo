// Writo result extras: colour-coded marks with tooltips, factual praise, feedback box.
// Everything here runs in the browser and reads only the essay text and the /api/check answer,
// so the API format and the free-check counter in checker.js are untouched.
// Load order: site.js -> insights.js -> checker.js
(function () {
  var W = window.Writo;
  var X = (window.WritoInsights = {});

  /* ---------- 1. Mistake types ---------- */
  // grammar = red (grammar, spelling, punctuation), style = green (repetition, informal, wordy),
  // context = grey (meaning, wording, relevance).
  X.TYPES = {
    grammar: { label: "Grammar or spelling" },
    style: { label: "Style" },
    context: { label: "Wording and meaning" }
  };
  var GRAMMAR_RE = /grammar|spell|typo|agreement|subject|verb|tense|article|plural|singular|preposition|punctuation|comma|apostrophe|capital|word form|countable|uncountable|pronoun|auxiliary|infinitive|gerund|conjugat|misspel/i;
  var STYLE_RE = /style|repeat|repetit|tautolog|redundan|informal|formal|wordy|concise|awkward|unnatural|natural|phrasing|collocation|cliche|cliché|overused|register|contraction|simpler|clearer/i;

  // Edit distance on short strings, to spot spelling slips ("enviroment" -> "environment").
  function distance(a, b) {
    if (Math.abs(a.length - b.length) > 3) return 9;
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }

  X.classify = function (m) {
    var why = String(m.why || ""), q = String(m.quote || "").toLowerCase().trim(), f = String(m.fix || "").toLowerCase().trim();
    if (GRAMMAR_RE.test(why)) return "grammar";
    if (STYLE_RE.test(why)) return "style";
    if (q && f && distance(q, f) <= 3) return "grammar"; // tiny edit: usually an ending, article or spelling
    return "context";
  };

  /* ---------- 2. Extra style marks found in the text itself ---------- */
  var INFORMAL = [
    ["a lot of", "many / a great deal of"], ["lots of", "many / numerous"], ["kids", "children"], ["stuff", "things / materials"],
    ["gonna", "going to"], ["wanna", "want to"], ["pretty much", "almost"], ["guys", "people"], ["okay", "acceptable"]
  ];
  var FULL = {
    "don't": "do not", "doesn't": "does not", "didn't": "did not", "can't": "cannot", "won't": "will not", "isn't": "is not",
    "aren't": "are not", "wasn't": "was not", "weren't": "were not", "shouldn't": "should not", "wouldn't": "would not",
    "couldn't": "could not", "haven't": "have not", "hasn't": "has not", "it's": "it is", "that's": "that is",
    "there's": "there is", "they're": "they are", "we're": "we are", "i'm": "I am", "you're": "you are"
  };
  var CONTRACTION_RE = new RegExp("\\b(?:" + Object.keys(FULL).join("|") + ")\\b", "gi");

  function overlaps(list, s, e) { return list.some(function (x) { return s < x.end && e > x.start; }); }

  X.autoMarks = function (essay, taken) {
    var out = [], lower = essay.toLowerCase(), max = 6;
    INFORMAL.forEach(function (pair) {
      var re = new RegExp("\\b" + pair[0].replace(/ /g, "\\s+") + "\\b", "gi"), hit;
      while ((hit = re.exec(lower)) && out.length < max) {
        var s = hit.index, e = s + hit[0].length;
        if (overlaps(taken, s, e) || overlaps(out, s, e)) continue;
        out.push({ start: s, end: e, type: "style", why: "Informal for an academic essay.", fix: pair[1] });
      }
    });
    var c;
    while ((c = CONTRACTION_RE.exec(essay)) && out.length < max) {
      var cs = c.index, ce = cs + c[0].length;
      if (overlaps(taken, cs, ce) || overlaps(out, cs, ce)) continue;
      out.push({ start: cs, end: ce, type: "style", why: "Contractions are informal. Write the full form.", fix: FULL[c[0].toLowerCase()] });
    }
    return out;
  };

  /* ---------- 3. Marked essay HTML ---------- */
  function findQuote(essay, quote) {
    // Same match as the server: case-insensitive, any run of spaces counts as one space.
    var re = new RegExp(quote.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"), "i");
    var m = re.exec(essay);
    return m ? { start: m.index, end: m.index + m[0].length } : null;
  }

  X.markedHTML = function (essay, mistakes) {
    var marks = [];
    (mistakes || []).forEach(function (m) {
      var at = m && m.quote ? findQuote(essay, m.quote) : null;
      if (at && !overlaps(marks, at.start, at.end)) marks.push({ start: at.start, end: at.end, type: X.classify(m), why: m.why, fix: m.fix });
    });
    marks = marks.concat(X.autoMarks(essay, marks));
    marks.sort(function (a, b) { return a.start - b.start; });
    var html = "", pos = 0, used = {};
    marks.forEach(function (x) {
      used[x.type] = true;
      html += W.esc(essay.slice(pos, x.start)) +
        '<mark class="miss t-' + x.type + '" tabindex="0" role="button" aria-label="' + W.esc(X.TYPES[x.type].label + ": " + essay.slice(x.start, x.end)) + '"' +
        ' data-type="' + x.type + '" data-why="' + W.esc(x.why || "") + '" data-fix="' + W.esc(x.fix || "") + '">' +
        W.esc(essay.slice(x.start, x.end)) + "</mark>";
      pos = x.end;
    });
    html += W.esc(essay.slice(pos));
    var legend = Object.keys(X.TYPES).filter(function (t) { return used[t]; }).map(function (t) {
      return '<li><i class="key t-' + t + '"></i>' + X.TYPES[t].label + "</li>";
    }).join("");
    return { html: html, legend: legend ? '<ul class="legend" aria-label="Colour key">' + legend + "</ul>" : "", count: marks.length };
  };

  /* ---------- 4. Tooltip (hover, keyboard focus, tap) ---------- */
  var tip, current;
  function hideTip() { if (tip) tip.hidden = true; if (current) current.classList.remove("on"); current = null; }
  function showTip(mark) {
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "mark-tip";
      tip.setAttribute("role", "tooltip");
      tip.hidden = true;
      document.body.appendChild(tip);
    }
    if (current) current.classList.remove("on");
    current = mark;
    mark.classList.add("on");
    var t = X.TYPES[mark.dataset.type] || X.TYPES.context;
    tip.className = "mark-tip t-" + mark.dataset.type;
    tip.innerHTML = "<b>" + W.esc(t.label) + "</b>" +
      (mark.dataset.why ? "<span>" + W.esc(mark.dataset.why) + "</span>" : "") +
      (mark.dataset.fix ? '<span class="tip-fix">Better: ' + W.esc(mark.dataset.fix) + "</span>" : "");
    tip.hidden = false;
    var r = mark.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    var left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    var top = r.top - h - 10 < 8 ? r.bottom + 10 : r.top - h - 10;
    tip.style.left = left + window.scrollX + "px";
    tip.style.top = top + window.scrollY + "px";
  }
  X.wireTips = function (root) {
    root.querySelectorAll("mark.miss").forEach(function (m) {
      m.addEventListener("mouseenter", function () { showTip(m); });
      m.addEventListener("mouseleave", hideTip);
      m.addEventListener("focus", function () { showTip(m); });
      m.addEventListener("blur", hideTip);
      // A tap also focuses the mark, so remember whether the tip was open before the tap.
      var wasOpen = false;
      m.addEventListener("pointerdown", function () { wasOpen = current === m; });
      m.addEventListener("click", function (e) { e.stopPropagation(); if (wasOpen) { hideTip(); m.blur(); } else showTip(m); wasOpen = false; });
      m.addEventListener("keydown", function (e) { if (e.key === "Escape") { hideTip(); m.blur(); } });
    });
  };
  document.addEventListener("click", hideTip);
  window.addEventListener("resize", hideTip);

  /* ---------- 5. Factual praise ---------- */
  // Each rule looks for something the writer really used. The praise quotes their words
  // and says where they are, so it never claims anything that is not in the essay.
  var ACADEMIC = ["mitigate", "alleviate", "exacerbate", "undermine", "foster", "facilitate", "enhance", "diminish", "outweigh", "jeopardise", "jeopardize", "advocate", "deter", "curb", "boost", "cultivate", "prioritise", "prioritize", "hinder", "sustain", "allocate", "contribute", "emphasise", "emphasize", "acknowledge", "compel", "entail", "accelerate", "safeguard", "tackle"];
  var RULES = [
    { re: /\bnot only\b[^.!?]{1,120}?\bbut also\b/i, crit: "Grammatical Range", what: "the paired structure" },
    { re: /\bif\b[^.!?]{1,80}?\b(?:would|could|might|will)\b/i, crit: "Grammatical Range", what: "a conditional sentence" },
    { re: /\b(?:although|even though|whereas|while)\b[^.!?,]{3,80}/i, crit: "Grammatical Range", what: "a contrast clause" },
    { re: /\b(?:tend to|tends to|appears? to|seems? to|is likely to|are likely to|arguably)\b/i, crit: "Task Response", what: "careful hedging" },
    { re: /\b(?:admittedly|it is true that|some may argue|critics (?:argue|claim)|opponents)\b[^.!?]{0,60}/i, crit: "Task Response", what: "a counter-argument" },
    { re: /\b(?:consequently|nevertheless|nonetheless|furthermore|moreover|in contrast|as a result|therefore)\b/i, crit: "Coherence and Cohesion", what: "a precise linking word" },
    { re: /, which\b[^.!?]{3,60}/i, crit: "Grammatical Range", what: "a non-defining relative clause" }
  ];
  function paragraphs(essay) {
    var parts = essay.split(/\n\s*\n|\n/).map(function (p) { return p.trim(); }).filter(Boolean);
    return parts.length ? parts : [essay];
  }
  function where(i, n) {
    if (n < 3) return "";
    if (i === 0) return "in the introduction";
    if (i === n - 1) return "in the conclusion";
    return ["", "in the second paragraph", "in the third paragraph", "in the fourth paragraph", "in the fifth paragraph"][i] || "in paragraph " + (i + 1);
  }
  function clip(s) {
    s = s.replace(/\s+/g, " ").trim();
    var w = s.split(" ");
    return w.length > 9 ? w.slice(0, 9).join(" ") + "…" : s;
  }
  function inMistake(text, mistakes) {
    var t = text.toLowerCase();
    return (mistakes || []).some(function (m) { return m.quote && (t.indexOf(m.quote.toLowerCase()) >= 0 || m.quote.toLowerCase().indexOf(t) >= 0); });
  }

  X.praise = function (essay, mistakes) {
    var paras = paragraphs(essay), found = [], seenCrit = {};
    paras.forEach(function (p, i) {
      RULES.forEach(function (r) {
        if (found.length >= 2 || seenCrit[r.what]) return;
        var m = r.re.exec(p);
        if (m && !inMistake(m[0], mistakes)) { found.push({ quote: clip(m[0]), what: r.what, crit: r.crit, where: where(i, paras.length) }); seenCrit[r.what] = true; }
      });
    });
    var vocab = null;
    paras.some(function (p, i) {
      return ACADEMIC.some(function (v) {
        var m = new RegExp("\\b" + v + "(?:s|d|ed|es|ing)?\\b", "i").exec(p);
        if (m && !inMistake(m[0], mistakes)) { vocab = { quote: m[0], where: where(i, paras.length) }; return true; }
        return false;
      });
    });

    var bits = [], crits = {};
    found.forEach(function (f) {
      bits.push(f.what + " “" + W.esc(f.quote) + "”" + (f.where ? " " + f.where : ""));
      crits[f.crit] = true;
    });
    if (vocab) {
      bits.push("the precise academic verb “" + W.esc(vocab.quote) + "”" + (vocab.where ? " " + vocab.where : ""));
      crits["Lexical Resource"] = true;
    }
    if (!bits.length) {
      // Fallback: still only facts about this essay.
      var n = (essay.trim().match(/\S+/g) || []).length;
      if (n >= 250 && paras.length >= 4) return "<b>What already works:</b> you wrote " + n + " words in " + paras.length + " clear paragraphs. That is the full length and structure Task 2 expects, which supports Task Response and Coherence.";
      if (paras.length >= 4) return "<b>What already works:</b> your essay has " + paras.length + " separate paragraphs, so the examiner can follow your structure. That supports Coherence and Cohesion.";
      return "";
    }
    var list = bits.length === 1 ? bits[0] : bits.slice(0, -1).join(", ") + " and " + bits[bits.length - 1];
    var cl = Object.keys(crits);
    var critText = cl.length === 1 ? cl[0] : cl.slice(0, -1).join(", ") + " and " + cl[cl.length - 1];
    return "<b>What already works:</b> you used " + list + ". This is what examiners look for in " + critText + ".";
  };

  /* ---------- 6. Feedback box ---------- */
  var FB_KEY = "writo-feedback-at", FB_PAUSE = 7 * 24 * 3600 * 1000; // ask again at most once a week
  var FACES = [
    { v: 1, e: "\u{1F61E}", l: "Bad" }, { v: 2, e: "\u{1F610}", l: "So-so" },
    { v: 3, e: "\u{1F642}", l: "Good" }, { v: 4, e: "\u{1F604}", l: "Great" }
  ];
  function recentlyRated() {
    try { return Date.now() - (parseInt(localStorage.getItem(FB_KEY), 10) || 0) < FB_PAUSE; } catch (e) { return false; }
  }
  var HEART = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.4 4.5 6.9 4.5c2.1 0 3.6 1.2 5.1 3 1.5-1.8 3-3 5.1-3 3.5 0 5.5 3.5 4.2 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>';

  X.feedbackHTML = function () {
    if (recentlyRated()) return "";
    return '<form class="fb" id="fb" novalidate aria-labelledby="fb-q">' +
      '<div class="fb-row"><p id="fb-q">How was this check?</p>' +
      '<div class="fb-faces" role="radiogroup" aria-labelledby="fb-q">' +
      FACES.map(function (f) { return '<button type="button" role="radio" aria-checked="false" data-v="' + f.v + '" aria-label="' + f.l + '" title="' + f.l + '">' + f.e + "</button>"; }).join("") +
      '</div><button type="button" class="fb-heart" data-v="5" aria-pressed="false">' + HEART + "<span>Love it</span></button></div>" +
      '<div class="fb-more" hidden><label for="fb-text" class="sr">What should we improve?</label>' +
      '<textarea id="fb-text" rows="2" maxlength="500" placeholder="Anything to add? (optional)"></textarea>' +
      '<button class="btn sm" type="submit">Send</button></div>' +
      "</form>";
  };

  X.wireFeedback = function (context) {
    var form = document.getElementById("fb");
    if (!form) return;
    var rating = 0, more = form.querySelector(".fb-more");
    // One id per box: changing the rating or adding text updates the same row on the server.
    var id = Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(8)), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
    var stored = false; // true once the server has confirmed the rating
    // "Already rated, do not ask for a week" is remembered only after the server said yes, never before.
    function send(text) {
      return W.api("/api/feedback", { id: id, rating: rating, text: text || "", band: context && context.band, page: location.pathname }).then(function (r) {
        if (r._ok) { stored = true; try { localStorage.setItem(FB_KEY, String(Date.now())); } catch (e) {} }
        else W.toast(r.error || "Could not send your rating. Please try again.");
        return r;
      });
    }
    form.querySelectorAll("[data-v]").forEach(function (b) {
      b.addEventListener("click", function () {
        rating = Number(b.dataset.v);
        form.querySelectorAll(".fb-faces button").forEach(function (x) { x.setAttribute("aria-checked", String(x === b)); });
        form.querySelector(".fb-heart").setAttribute("aria-pressed", String(rating === 5));
        if (more.hidden) {
          more.hidden = false;
          requestAnimationFrame(function () { more.classList.add("open"); });
        }
        send(""); // the rating counts even if they never write a word
        document.getElementById("fb-text").focus({ preventScroll: true });
      });
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!rating) return;
      var text = document.getElementById("fb-text").value.trim();
      var done = function () { form.innerHTML = '<p class="fb-thanks">' + HEART + " Thank you! This helps us make Writo better.</p>"; if (W.sound) W.sound("done"); };
      if (!text && stored) return done();
      var sendBtn = form.querySelector("button[type=submit]");
      sendBtn.disabled = true;
      send(text).then(function (r) { if (r._ok) done(); else sendBtn.disabled = false; });
    });
  };
})();
