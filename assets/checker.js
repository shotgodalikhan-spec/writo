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

  // Guests get GUEST_TOTAL checks in this browser, no sign-up needed.
  // The server has its own daily limit per network; this counter decides when to suggest an account.
  var GUEST_TOTAL = 5, GUEST_KEY = "writo-guest-used";
  function guestUsed() {
    try { return Math.max(0, parseInt(localStorage.getItem(GUEST_KEY), 10) || 0); } catch (e) { return 0; }
  }
  function addGuestUse() {
    try { localStorage.setItem(GUEST_KEY, String(guestUsed() + 1)); } catch (e) {}
  }
  function guestLeft() { return Math.max(0, GUEST_TOTAL - guestUsed()); }

  function showLeft(n, loggedIn) {
    if (n == null) return;
    if (!loggedIn) {
      var g = Math.min(n, guestLeft());
      $("left").textContent = guestLeft() === 0 || g === 0
        ? "Free checks without an account are used up for today."
        : guestUsed() === 0 ? "" : g + (g === 1 ? " free check" : " free checks") + " left without an account.";
      return;
    }
    $("left").textContent = n === 0 ? "No free checks left today." : n + (n === 1 ? " check" : " checks") + " left today.";
  }
  var me = { user: null };
  W.me.then(function (m) { me = m; showLeft(m.remaining, Boolean(m.user)); W._user = m.user; });

  // Soft invitation shown when a guest has used all free checks. Never blocks the rest of the site.
  var gate;
  function openGate() {
    if (!gate) {
      gate = document.createElement("dialog");
      gate.className = "gate";
      gate.setAttribute("aria-labelledby", "gate-title");
      gate.innerHTML =
        '<form method="dialog" class="gate-close"><button class="icon-btn" aria-label="Close">×</button></form>' +
        '<h2 id="gate-title">You have used your ' + GUEST_TOTAL + ' free checks</h2>' +
        '<p>Create a free account to keep going: ' + W.esc(String((me.limits && me.limits.user) || 5)) + ' checks every day, and your results saved if you want them. Your essay stays where it is.</p>' +
        '<div class="gate-actions"><a class="btn" href="/signup">Create a free account</a><a class="btn ghost" href="/login">Log in</a></div>' +
        '<p class="muted small">Need more? <a href="/pricing">See the Pro plan</a>.</p>';
      document.body.appendChild(gate);
      gate.addEventListener("click", function (e) { if (e.target === gate) gate.close(); });
    }
    if (typeof gate.showModal === "function") { if (!gate.open) gate.showModal(); }
    else showError({ error: "You have used your " + GUEST_TOTAL + " free checks.", limit: "guest" });
  }

  var stages = ["Reading your essay", "Scoring the four criteria", "Finding your key mistakes", "Rewriting your weakest paragraph"];
  var stageTimer;
  function loading(on) {
    $("loading").hidden = !on;
    btn.disabled = on;
    clearInterval(stageTimer);
    if (on) {
      var i = 0;
      $("stage").textContent = stages[0];
      stageTimer = setInterval(function () { i = Math.min(i + 1, stages.length - 1); $("stage").textContent = stages[i]; }, 4500);
    }
  }

  function showError(r) {
    var extra = "";
    if (r.limit === "guest") extra = ' <a class="btn sm" style="margin-left:6px" href="/signup">Create a free account</a>';
    errEl.className = "alert err";
    errEl.innerHTML = W.esc(r.error) + extra;
    errEl.hidden = false;
  }

  btn.addEventListener("click", function () {
    errEl.hidden = true;
    var n = words(essayEl.value);
    if (n < 120) { showError({ error: "Your essay has " + n + " words. Please write at least 120 (Task 2 needs 250+)." }); essayEl.focus(); return; }
    if (n > 500) { showError({ error: "Your essay has " + n + " words. The maximum is 500." }); return; }
    if (!me.user && guestLeft() === 0) { openGate(); return; }
    loading(true);
    var essay = essayEl.value, task = taskEl.value;
    W.api("/api/check", { essay: essay, task: task }).then(function (r) {
      loading(false);
      if (!r._ok) { showError(r); if (r.limit === "guest") openGate(); return; }
      if (!r.loggedIn) addGuestUse();
      render(r, essay, task);
      showLeft(r.remaining, r.loggedIn);
      if (!r.loggedIn) {
        try { localStorage.setItem("writo-pending", JSON.stringify({ essay: essay, task: task, result: { overall: r.overall, criteria: r.criteria, mistakes: r.mistakes, rewrite: r.rewrite } })); } catch (e) {}
      }
    });
  });

  function highlight(essay, mistakes) {
    var lower = essay.toLowerCase(), marks = [];
    mistakes.forEach(function (m, i) {
      var at = lower.indexOf(m.quote.toLowerCase());
      if (at >= 0 && !marks.some(function (x) { return at < x.end && at + m.quote.length > x.start; })) marks.push({ start: at, end: at + m.quote.length, i: i });
    });
    marks.sort(function (a, b) { return a.start - b.start; });
    var out = "", pos = 0;
    marks.forEach(function (x) {
      var m = mistakes[x.i];
      out += W.esc(essay.slice(pos, x.start)) + '<mark class="miss" title="' + W.esc(m.fix ? "Better: " + m.fix : m.why) + '">' + W.esc(essay.slice(x.start, x.end)) + "</mark>";
      pos = x.end;
    });
    return out + W.esc(essay.slice(pos));
  }

  // One-step sign-up under a guest's result: email, password, consent, history on by default.
  function saveBox() {
    var n = W.esc(String((me.limits && me.limits.user) || 5));
    return '<form class="save-box" id="save-form" novalidate>' +
      '<h3>Save this result and get ' + n + ' free checks a day</h3>' +
      '<div class="save-fields">' +
      '<div class="field"><label for="s-email">Email</label><input id="s-email" type="email" autocomplete="email" placeholder="you@gmail.com" required></div>' +
      '<div class="field"><label for="s-pass">Password <span class="hint">8+ characters</span></label><input id="s-pass" type="password" autocomplete="new-password" minlength="8" required></div>' +
      "</div>" +
      '<label class="check-row"><input id="s-consent" type="checkbox" required><span>I agree to the <a href="/terms" target="_blank">Terms of use</a> and <a href="/privacy" target="_blank">Privacy policy</a>.</span></label>' +
      '<div class="save-actions"><label class="check-row"><input id="s-history" type="checkbox" checked><span>Save my essays <span class="hint">(only you can see them)</span></span></label>' +
      '<button class="btn" type="submit">Create free account</button></div>' +
      '<div id="save-err" role="alert" hidden></div>' +
      '<p class="muted small" style="margin:12px 0 0">Already have an account? <a href="/login">Log in</a></p>' +
      "</form>";
  }
  function wireSaveBox() {
    var form = $("save-form");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      W.signup({
        email: $("s-email"), password: $("s-pass"), consent: $("s-consent"), history: $("s-history"),
        button: form.querySelector("button[type=submit]"), error: $("save-err")
      }).then(function (res) {
        if (!res) return;
        me.user = res.user || { email: $("s-email").value };
        form.outerHTML = '<div class="alert ok saved-note">Account created. ' +
          (res.saved ? 'This result is saved in <a href="/account">your history</a>.' : 'Your history is off, so this result was not stored. <a href="/account">Go to my account</a>.') + "</div>";
        W.toast("Account created");
        W.refreshAuth();
        W.api("/api/me").then(function (m) { if (m._ok) showLeft(m.remaining, true); });
      });
    });
  }

  function render(r, essay, task) {
    var crit = r.criteria.map(function (c) {
      return '<div class="crit-row"><b>' + W.esc(c.name) + '</b><span class="band">' + W.band(c) + '</span><div class="track"><i data-w="' + (c.high / 9 * 100).toFixed(1) + '%"></i></div><p>' + W.esc(c.comment) + "</p></div>";
    }).join("");
    var fixes = r.mistakes.length
      ? '<ul class="fixes">' + r.mistakes.map(function (m) { return "<li><s>" + W.esc(m.quote) + "</s> → <b>" + W.esc(m.fix) + '</b><br><span class="muted small">' + W.esc(m.why) + "</span></li>"; }).join("") + "</ul>"
      : "";
    var html =
      '<div class="panel"><div class="result-top"><div class="stamp animate" role="img" aria-label="Estimated overall band ' + W.band(r.overall) + '"><div><b>' + W.band(r.overall) + "</b><span>estimated band</span></div></div>" +
      '<div><h2 style="margin-bottom:.3em">Your estimated band</h2><p class="muted" style="margin:0">A range, not an exact score. Here is how each criterion went.</p>' +
      (!r.loggedIn ? '<p style="margin:10px 0 0"><a href="#save-form" class="small" style="font-weight:700">Save this result with a free account</a></p>' : "") + "</div></div>" +
      '<div class="crit">' + crit + "</div>" +
      (r.mistakes.length ? '<div class="marked"><h3>Your essay, marked</h3><div class="paper">' + (task ? '<div class="task">Task: ' + W.esc(task) + "</div>" : "") + highlight(essay, r.mistakes) + "</div>" + fixes + "</div>" : "") +
      (r.rewrite ? '<div class="marked"><h3>Your weakest paragraph, one band higher</h3><div class="rewrite" id="rewrite-text">' + W.esc(r.rewrite) + '</div><p style="margin-top:10px"><button class="btn quiet sm" type="button" id="copy">Copy paragraph</button></p></div>' : "") +
      (!r.loggedIn ? saveBox() : (r.saved ? '<p class="muted small" style="margin-top:16px">Saved to your <a href="/account">history</a>.</p>' : "")) +
      "</div>";
    resEl.innerHTML = html;
    resEl.hidden = false;
    if (!r.loggedIn) wireSaveBox();
    requestAnimationFrame(function () {
      resEl.querySelectorAll(".track i").forEach(function (i) { i.style.width = i.dataset.w; });
    });
    var copy = $("copy");
    if (copy) copy.addEventListener("click", function () {
      navigator.clipboard.writeText(r.rewrite).then(function () { W.toast("Paragraph copied"); }, function () { W.toast("Select the text and copy it manually"); });
    });
    resEl.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }
})();
