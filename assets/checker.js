// Writo essay checker UI.
(function () {
  var W = window.Writo;
  var $ = function (id) { return document.getElementById(id); };
  var essayEl = $("essay"), taskEl = $("task"), btn = $("submit"), errEl = $("error"), resEl = $("result");

  var TOPICS = [
    "Some people think that university education should be free for everyone. To what extent do you agree or disagree?",
    "More and more people work from home. Do the advantages of this trend outweigh the disadvantages?",
    "Some believe that children should start learning a foreign language at primary school. Others think it is better to start at secondary school. Discuss both views and give your opinion.",
    "In many cities, public transport is used less than private cars. Why is this the case, and what can be done to change it?",
    "Some people say that social media does more harm than good to young people. To what extent do you agree or disagree?",
    "Governments should spend more money on public parks than on building new roads. Do you agree or disagree?",
    "Many people believe that famous athletes are paid too much. Discuss both sides and give your own opinion.",
    "In some countries, more young adults are living with their parents for longer. What are the reasons, and is this a positive or negative development?",
    "Some people think that art and music should be compulsory subjects at school. To what extent do you agree?",
    "Tourism brings money to a country but can also damage local culture. Do the benefits outweigh the drawbacks?",
    "Online shopping is replacing shopping in physical stores. Is this a positive or negative development?",
    "Some say that the best way to reduce crime is to give longer prison sentences. Others believe there are better ways. Discuss both views and give your opinion.",
    "Many people now get their news from the internet rather than newspapers or television. What are the advantages and disadvantages of this?",
    "Some people think that every young person should do a year of community service after school. Do you agree or disagree?",
    "Fast food is becoming more popular in many countries. What problems does this cause, and what solutions can you suggest?",
    "Some believe that space exploration is a waste of money that should be spent on problems on Earth. To what extent do you agree?",
    "It is better for children to grow up in the countryside than in a big city. Do you agree or disagree?",
    "Many old buildings are being replaced by modern ones. Should governments protect historic buildings? Give your opinion.",
    "Some people think that homework should be banned for young students. Discuss both views and give your opinion.",
    "In many workplaces, people are expected to answer emails outside working hours. Is this a positive or negative trend?",
    "Some people believe that zoos are cruel and should be closed. Others think they help protect animals. Discuss both views.",
    "Advertising aimed at children should be banned. To what extent do you agree or disagree?",
    "Many people choose to study abroad. What are the advantages and disadvantages of studying in another country?",
    "Some say that technology has made people less sociable. Do you agree or disagree?",
    "Cities are becoming more crowded. What problems does this create, and how can they be solved?",
    "Some people think that the government should pay for everyone's healthcare. Others believe individuals should pay. Discuss both views.",
    "Learning history at school is less useful than learning science and technology. To what extent do you agree?",
    "Many people throw away items that could be repaired. Why does this happen, and what can be done about it?",
    "Some believe that unpaid internships are a good way for young people to gain experience. Others think they are unfair. Discuss both views.",
    "Plastic bags and bottles should be banned completely. Do you agree or disagree?",
    "Older people have a lot to teach the young, but their experience is often ignored. Why is this, and what can be done?",
    "Some people prefer to work for a large company, while others prefer a small one. Discuss the advantages of both and give your opinion."
  ];

  function words(t) { return (String(t).trim().match(/\S+/g) || []).length; }

  // Draft autosave: the essay is never lost.
  try {
    var draft = JSON.parse(localStorage.getItem("writo-draft") || "null");
    if (draft) { essayEl.value = draft.essay || ""; taskEl.value = draft.task || ""; }
  } catch (e) {}
  var saveTimer;
  function saveDraft() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem("writo-draft", JSON.stringify({ essay: essayEl.value, task: taskEl.value })); } catch (e) {}
    }, 400);
  }
  function updateCount() {
    var n = words(essayEl.value);
    var c = $("count");
    c.textContent = n + (n === 1 ? " word" : " words") + (n > 0 && n < 250 ? " (aim for 250+)" : "");
    c.classList.toggle("ok", n >= 250);
  }
  essayEl.addEventListener("input", function () { updateCount(); saveDraft(); });
  taskEl.addEventListener("input", saveDraft);
  updateCount();

  $("random").addEventListener("click", function () {
    var next;
    do { next = TOPICS[Math.floor(Math.random() * TOPICS.length)]; } while (next === taskEl.value && TOPICS.length > 1);
    taskEl.value = next;
    saveDraft();
  });

  // Exam timer
  var total = 40 * 60, left = total, ticking = null;
  function drawTimer() {
    var m = Math.floor(left / 60), s = left % 60;
    $("timer-out").textContent = (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
    $("timer").classList.toggle("warn", left <= 300);
  }
  $("timer-toggle").addEventListener("click", function () {
    var t = $("timer"), open = t.hidden;
    t.hidden = !open;
    this.setAttribute("aria-expanded", String(open));
  });
  $("timer-start").addEventListener("click", function () {
    if (ticking) { clearInterval(ticking); ticking = null; this.textContent = "Resume"; return; }
    if (left === 0) left = total;
    this.textContent = "Pause";
    var self = this;
    ticking = setInterval(function () {
      left--;
      drawTimer();
      if (left === 300) W.toast("5 minutes left. Start proofreading.");
      if (left <= 0) { clearInterval(ticking); ticking = null; self.textContent = "Start"; W.toast("Time is up. Check your essay now."); }
    }, 1000);
  });
  $("timer-reset").addEventListener("click", function () {
    clearInterval(ticking); ticking = null; left = total; drawTimer(); $("timer-start").textContent = "Start";
  });


  /* ---------- Checks left today ---------- */
  // The server is the only counter (lib/quota.js): /api/me on load, then every /api/check answer.
  var me = { user: null, remaining: null, limits: { guest: 2, user: 5 } };
  var daily = function () { return me.user ? me.limits.user : me.limits.guest; };
  var hoursLeft = function () { return Math.max(1, Math.round((me.resetInSeconds || 3600) / 3600)); };

  function setQuota(r) {
    if (r.remaining != null) me.remaining = r.remaining;
    if (r.limit !== undefined) me.limit = r.limit;
    if (r.resetInSeconds) me.resetInSeconds = r.resetInSeconds;
    if (me.remaining > 0) me.limit = null;
    // A successful check that used the last one says "0 left" without naming a rule: it is the person's own limit.
    else if (me.remaining === 0 && !me.limit) me.limit = me.user ? "user" : "guest";
    drawQuota();
  }
  function quotaText() {
    return me.remaining == null ? "" : "Checks left today: " + me.remaining + " of " + daily();
  }
  function drawQuota() {
    document.querySelectorAll("[data-quota]").forEach(function (el) { el.textContent = quotaText(); });
    var out = me.remaining === 0, box = $("out");
    var saved = Boolean(findRecent(essayEl.value, taskEl.value));
    btn.disabled = busy || (out && !saved);
    btn.textContent = out && saved ? "Show saved result" : "Check my essay";
    if (!out) { box.hidden = true; return; }
    var msg = {
      guest: "You have used today's " + daily() + " free checks. A free account gives you " + me.limits.user + " checks every day.",
      user: "You have used all " + daily() + " checks for today.",
      ip: "Too many checks from your network today.",
      global: "Writo has reached its free daily capacity."
    }[me.limit] || "No checks left today.";
    box.innerHTML = W.esc(msg) + " New checks in about " + hoursLeft() + " h. Your essay stays here, you can keep editing it." +
      (!me.user && me.limit === "guest" ? ' <button class="btn sm" type="button" data-gate>Create free account</button>' : "");
    box.hidden = false;
    var g = box.querySelector("[data-gate]");
    if (g) g.addEventListener("click", openGate);
  }
  W.me.then(function (m) {
    me.user = m.user;
    if (m.limits) me.limits = m.limits;
    setQuota(m);
  });

  /* ---------- My recent checks (guest, this device only) ---------- */
  // Guests' essays are never stored on the server. Up to 20 checks stay in this browser, one per essay,
  // and move to the account at sign-up (site.js W.signup).
  var RECENT_KEY = "writo-recent", RECENT_MAX = 20;
  function norm(s) { return String(s || "").replace(/[  -​  　]/g, " ").replace(/\s+/g, " ").trim(); }
  function sameKey(essay, task) { return norm(essay) + "\n" + norm(task); }
  function readRecent() {
    try { var l = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(l) ? l : []; } catch (e) { return []; }
  }
  function writeRecent(l) { try { localStorage.setItem(RECENT_KEY, JSON.stringify(l.slice(0, RECENT_MAX))); } catch (e) {} }
  function findRecent(essay, task) {
    if (me.user || !norm(essay)) return null;
    var k = sameKey(essay, task);
    return readRecent().filter(function (c) { return sameKey(c.essay, c.task) === k; })[0] || null;
  }
  function addRecent(essay, task, r) {
    var k = sameKey(essay, task);
    var l = readRecent().filter(function (c) { return sameKey(c.essay, c.task) !== k; });
    l.unshift({ essay: essay, task: task, at: Date.now(), result: { overall: r.overall, criteria: r.criteria, mistakes: r.mistakes, rewrite: r.rewrite } });
    writeRecent(l);
  }
  function drawRecent() {
    var box = $("recent"), l = me.user ? [] : readRecent();
    if (!l.length) { box.hidden = true; box.innerHTML = ""; return; }
    box.innerHTML = '<h2 class="recent-title">My recent checks <span class="hint">saved on this device</span></h2><ul class="history">' +
      l.map(function (c, i) {
        var t = c.task ? c.task.slice(0, 90) + (c.task.length > 90 ? "…" : "") : norm(c.essay).slice(0, 70) + "…";
        return '<li><div><b>' + W.esc(t) + '</b></div><span class="band">' + W.band(c.result.overall) + '</span><div class="muted small">' + W.date(c.at) + " · " + words(c.essay) + ' words · <button class="link-btn" type="button" data-recent="' + i + '">Open</button></div></li>';
      }).join("") + "</ul>";
    box.hidden = false;
    box.querySelectorAll("[data-recent]").forEach(function (b) {
      b.addEventListener("click", function () {
        var c = readRecent()[Number(b.dataset.recent)];
        if (!c) return;
        essayEl.value = c.essay; taskEl.value = c.task || ""; updateCount(); saveDraft();
        showSaved(c.result, c.essay, c.task || "", c.at);
      });
    });
  }
  W.me.then(drawRecent);

  /* ---------- Sign-up window (guest out of checks) ---------- */
  // After sign-up the essay that is still in the box is checked automatically.
  var gate;
  function openGate() {
    var n = W.esc(String(me.limits.user));
    if (!gate) {
      gate = document.createElement("dialog");
      gate.className = "gate";
      gate.setAttribute("aria-labelledby", "gate-title");
      gate.innerHTML =
        '<form method="dialog" class="gate-close"><button class="icon-btn" aria-label="Close">×</button></form>' +
        '<h2 id="gate-title">Get ' + n + ' free checks every day</h2>' +
        '<p><b class="gift">A free account gives you ' + n + ' checks a day and keeps all your results.</b> Your essay stays where it is and is checked right after.</p>' +
        '<form id="gate-form" novalidate>' +
        '<div class="field"><label for="g-email">Email</label><input id="g-email" type="email" autocomplete="email" placeholder="you@gmail.com" required></div>' +
        '<div class="field"><label for="g-pass">Password <span class="hint">8+ characters</span></label><input id="g-pass" type="password" autocomplete="new-password" minlength="8" required></div>' +
        '<label class="check-row field"><input id="g-consent" type="checkbox" required><span>I agree to the <a href="/terms" target="_blank">Terms of use</a> and <a href="/privacy" target="_blank">Privacy policy</a>.</span></label>' +
        '<div id="gate-err" role="alert" hidden></div>' +
        '<button class="btn big" type="submit">Get ' + n + ' free checks</button>' +
        "</form>" +
        '<p class="muted small" style="margin:14px 0 0">Already have an account? <a href="/login">Log in</a></p>';
      document.body.appendChild(gate);
      gate.addEventListener("click", function (e) { if (e.target === gate) gate.close(); });
      $("gate-form").addEventListener("submit", function (e) {
        e.preventDefault();
        W.signup({
          email: $("g-email"), password: $("g-pass"), consent: $("g-consent"),
          button: this.querySelector("button[type=submit]"), error: $("gate-err")
        }).then(function (res) {
          if (!res) return;
          afterSignup(res, $("g-email").value);
          gate.close();
          W.toast("Account created: " + me.limits.user + " free checks a day");
          W.api("/api/me").then(function (m) {
            if (m._ok) setQuota(m);
            if (norm(essayEl.value) && me.remaining > 0) btn.click();
          });
        });
      });
    }
    if (typeof gate.showModal === "function") { if (!gate.open) gate.showModal(); }
    else location.href = "/signup";
  }
  function afterSignup(res, email) {
    me.user = res.user || { email: email };
    W.refreshAuth();
    drawRecent();
  }

  /* ---------- "Start a new essay?" window ---------- */
  var fresh;
  function askNewEssay() {
    if (!fresh) {
      fresh = document.createElement("dialog");
      fresh.className = "gate confirm";
      fresh.setAttribute("aria-labelledby", "fresh-title");
      fresh.innerHTML = '<h2 id="fresh-title">Start a new essay?</h2><p id="fresh-text"></p>' +
        '<div class="confirm-actions"><button class="btn" type="button" id="fresh-yes">Start new essay</button><button class="btn ghost" type="button" id="fresh-no">Cancel</button></div>';
      document.body.appendChild(fresh);
      fresh.addEventListener("click", function (e) { if (e.target === fresh) fresh.close(); });
      $("fresh-no").addEventListener("click", function () { fresh.close(); });
      $("fresh-yes").addEventListener("click", function () {
        fresh.close();
        essayEl.value = ""; taskEl.value = "";
        updateCount(); saveDraft();
        resEl.hidden = true; resEl.innerHTML = ""; errEl.hidden = true;
        drawQuota();
        $("try-title").scrollIntoView({ behavior: smooth(), block: "start" });
        essayEl.focus({ preventScroll: true });
      });
    }
    $("fresh-text").textContent = me.user ? "This one is saved in your account history." : "This one is saved in My recent checks on this device.";
    if (typeof fresh.showModal === "function") fresh.showModal();
    else $("fresh-yes").click();
  }
  function smooth() { return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"; }

  /* ---------- Checking ---------- */
  var stages = ["Reading your essay", "Scoring the four criteria", "Finding your key mistakes", "Rewriting your weakest paragraph"];
  var stageTimer, busy = false;
  function loading(on) {
    busy = on;
    $("loading").hidden = !on;
    clearInterval(stageTimer);
    if (on) {
      var i = 0;
      $("stage").textContent = stages[0];
      stageTimer = setInterval(function () { i = Math.min(i + 1, stages.length - 1); $("stage").textContent = stages[i]; }, 4500);
    }
    drawQuota();
  }

  function showError(r) {
    errEl.className = "alert err";
    errEl.textContent = r.error;
    errEl.hidden = false;
  }

  essayEl.addEventListener("input", drawQuota);
  taskEl.addEventListener("input", drawQuota);

  btn.addEventListener("click", function () {
    if (busy) return; // a double click sends one request
    errEl.hidden = true;
    var n = words(essayEl.value);
    if (n < 120) { showError({ error: "Your essay has " + n + " words. Please write at least 120 (Task 2 needs 250+)." }); essayEl.focus(); return; }
    if (n > 500) { showError({ error: "Your essay has " + n + " words. The maximum is 500." }); return; }
    var essay = essayEl.value, task = taskEl.value;
    var saved = findRecent(essay, task);
    if (saved) { showSaved(saved.result, essay, task, saved.at); return; }
    if (me.remaining === 0) { drawQuota(); return; }
    loading(true);
    W.api("/api/check", { essay: essay, task: task }).then(function (r) {
      loading(false);
      if (r.remaining != null || r.limit) setQuota(r._status === 429 && r.limit ? { remaining: 0, limit: r.limit, resetInSeconds: r.resetInSeconds } : r);
      if (!r._ok) { if (r._status !== 429 || !r.limit) showError(r); else $("out").scrollIntoView({ behavior: smooth(), block: "center" }); return; }
      if (!r.loggedIn) { addRecent(essay, task, r); drawRecent(); }
      render(r, essay, task);
      drawQuota();
    });
  });

  function showSaved(result, essay, task, at) {
    errEl.hidden = true;
    render(Object.assign({}, result, { loggedIn: Boolean(me.user), saved: true, already: true, checkedAt: at }), essay, task);
  }

  // Colour-coded marks, tooltips, praise and the feedback box live in assets/insights.js (window.WritoInsights).
  var X = window.WritoInsights;

  // One-step sign-up under a guest's result: email, password, consent.
  function saveBox() {
    var n = W.esc(String(me.limits.user));
    return '<form class="save-box" id="save-form" novalidate>' +
      '<h3>Keep your results and get ' + n + ' free checks a day</h3>' +
      '<div class="save-fields">' +
      '<div class="field"><label for="s-email">Email</label><input id="s-email" type="email" autocomplete="email" placeholder="you@gmail.com" required></div>' +
      '<div class="field"><label for="s-pass">Password <span class="hint">8+ characters</span></label><input id="s-pass" type="password" autocomplete="new-password" minlength="8" required></div>' +
      "</div>" +
      '<div class="save-actions"><label class="check-row"><input id="s-consent" type="checkbox" required><span>I agree to the <a href="/terms" target="_blank">Terms of use</a> and <a href="/privacy" target="_blank">Privacy policy</a>.</span></label>' +
      '<button class="btn" type="submit">Create free account</button></div>' +
      '<div id="save-err" role="alert" hidden></div>' +
      '<p class="muted small" style="margin:12px 0 0">Your checks on this device move to your account. Already have one? <a href="/login">Log in</a></p>' +
      "</form>";
  }
  function wireSaveBox() {
    var form = $("save-form");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      W.signup({
        email: $("s-email"), password: $("s-pass"), consent: $("s-consent"),
        button: form.querySelector("button[type=submit]"), error: $("save-err")
      }).then(function (res) {
        if (!res) return;
        afterSignup(res, $("s-email").value);
        form.outerHTML = '<div class="alert ok saved-note">Account created. ' + (res.saved ? res.saved + (res.saved === 1 ? " check is" : " checks are") + ' saved in <a href="/account">your history</a>.' : '<a href="/account">Go to my account</a>.') + "</div>";
        W.toast("Account created");
        W.api("/api/me").then(function (m) { if (m._ok) setQuota(m); });
      });
    });
  }

  function render(r, essay, task) {
    var crit = r.criteria.map(function (c) {
      return '<div class="crit-row"><b>' + W.esc(c.name) + '</b><span class="band">' + W.band(c) + '</span><div class="track"><i data-w="' + (c.high / 9 * 100).toFixed(1) + '%"></i></div><p>' + W.esc(c.comment) + "</p></div>";
    }).join("");
    var mistakes = r.mistakes || [];
    var marked = X.markedHTML(essay, mistakes);
    var praise = X.praise(essay, mistakes);
    var fixes = mistakes.length
      ? '<ul class="fixes">' + mistakes.map(function (m) { return '<li class="t-' + X.classify(m) + '"><s>' + W.esc(m.quote) + "</s> → <b>" + W.esc(m.fix) + '</b><br><span class="muted small">' + W.esc(m.why) + "</span></li>"; }).join("") + "</ul>"
      : "";
    var already = r.already ? '<p class="alert ok already">Already checked' + (r.checkedAt ? " on " + W.date(r.checkedAt) : "") + ". This is your saved result, no check was used.</p>" : "";
    var actions = '<div class="next-actions"><button class="btn" type="button" data-new>Check a new essay</button>' +
      '<button class="btn ghost" type="button" data-edit>Edit and re-check</button><button class="link-btn" type="button" data-ideas="idea">Suggest an idea</button><span class="muted small" data-quota>' + W.esc(quotaText()) + "</span></div>";
    var html =
      '<div class="panel">' + already + '<div class="result-top"><div class="stamp animate" role="img" aria-label="Estimated overall band ' + W.band(r.overall) + '"><div><b>' + W.band(r.overall) + "</b><span>estimated band</span></div></div>" +
      '<div><h2 style="margin-bottom:.3em">Your estimated band</h2><p class="muted" style="margin:0">A range, not an exact score. Here is how each criterion went.</p>' +
      (!r.loggedIn ? '<p style="margin:10px 0 0"><a href="#save-form" class="small" style="font-weight:700">Keep this result with a free account</a></p>' : "") + "</div></div>" +
      '<div class="crit">' + crit + "</div>" +
      (marked.count ? '<div class="marked"><h3>Your essay, marked</h3>' + marked.legend + '<p class="muted small mark-help">Hover over or tap a highlight to see why.</p><div class="paper">' + (task ? '<div class="task">Task: ' + W.esc(task) + "</div>" : "") + marked.html + "</div>" + fixes + "</div>" : "") +
      (r.rewrite ? '<div class="marked"><h3>Your weakest paragraph, one band higher</h3><div class="rewrite" id="rewrite-text">' + W.esc(r.rewrite) + '</div><p style="margin-top:10px"><button class="btn quiet sm" type="button" id="copy">Copy paragraph</button></p></div>' : "") +
      (praise ? '<p class="praise">' + praise + "</p>" : "") +
      actions +
      (!r.loggedIn ? saveBox() : (r.saved ? '<p class="muted small" style="margin-top:16px">Saved to your <a href="/account">history</a>.</p>' : "")) +
      X.feedbackHTML() +
      "</div>";
    resEl.innerHTML = html;
    resEl.hidden = false;
    X.wireTips(resEl);
    X.wireFeedback({ band: W.band(r.overall) });
    if (!r.loggedIn) wireSaveBox();
    resEl.querySelector("[data-new]").addEventListener("click", askNewEssay);
    resEl.querySelector("[data-edit]").addEventListener("click", function () {
      $("try-title").scrollIntoView({ behavior: smooth(), block: "start" });
      essayEl.focus({ preventScroll: true });
    });
    requestAnimationFrame(function () {
      resEl.querySelectorAll(".track i").forEach(function (i) { i.style.width = i.dataset.w; });
    });
    var copy = $("copy");
    if (copy) copy.addEventListener("click", function () {
      navigator.clipboard.writeText(r.rewrite).then(function () { W.toast("Paragraph copied"); }, function () { W.toast("Select the text and copy it manually"); });
    });
    resEl.scrollIntoView({ behavior: smooth(), block: "start" });
  }
})();
