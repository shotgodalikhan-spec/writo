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

  function showLeft(n, loggedIn) {
    if (n == null) return;
    $("left").textContent = n === 0
      ? "No free checks left today."
      : n + (n === 1 ? " free check" : " free checks") + " left today" + (loggedIn ? "." : " without an account.");
  }
  W.me.then(function (me) { showLeft(me.remaining, Boolean(me.user)); W._user = me.user; });

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
    loading(true);
    var essay = essayEl.value, task = taskEl.value;
    W.api("/api/check", { essay: essay, task: task }).then(function (r) {
      loading(false);
      if (!r._ok) { showError(r); return; }
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

  function render(r, essay, task) {
    var crit = r.criteria.map(function (c) {
      return '<div class="crit-row"><b>' + W.esc(c.name) + '</b><span class="band">' + W.band(c) + '</span><div class="track"><i data-w="' + (c.high / 9 * 100).toFixed(1) + '%"></i></div><p>' + W.esc(c.comment) + "</p></div>";
    }).join("");
    var fixes = r.mistakes.length
      ? '<ul class="fixes">' + r.mistakes.map(function (m) { return "<li><s>" + W.esc(m.quote) + "</s> → <b>" + W.esc(m.fix) + '</b><br><span class="muted small">' + W.esc(m.why) + "</span></li>"; }).join("") + "</ul>"
      : "";
    var html =
      '<div class="panel"><div class="result-top"><div class="stamp animate" role="img" aria-label="Estimated overall band ' + W.band(r.overall) + '"><div><b>' + W.band(r.overall) + "</b><span>estimated band</span></div></div>" +
      '<div><h2 style="margin-bottom:.3em">Your estimated band</h2><p class="muted" style="margin:0">A range, not an exact score. Here is how each criterion went.</p></div></div>' +
      '<div class="crit">' + crit + "</div>" +
      (r.mistakes.length ? '<div class="marked"><h3>Your essay, marked</h3><div class="paper">' + (task ? '<div class="task">Task: ' + W.esc(task) + "</div>" : "") + highlight(essay, r.mistakes) + "</div>" + fixes + "</div>" : "") +
      (r.rewrite ? '<div class="marked"><h3>Your weakest paragraph, one band higher</h3><div class="rewrite" id="rewrite-text">' + W.esc(r.rewrite) + '</div><p style="margin-top:10px"><button class="btn quiet sm" type="button" id="copy">Copy paragraph</button></p></div>' : "") +
      (!r.loggedIn ? '<div class="upsell"><span><b>Want to track your progress?</b> A free account gives you 5 checks a day and an optional history.</span><a class="btn sm" href="/signup">Create a free account</a></div>' : (r.saved ? '<p class="muted small" style="margin-top:16px">Saved to your <a href="/account">history</a>.</p>' : "")) +
      "</div>";
    resEl.innerHTML = html;
    resEl.hidden = false;
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
