// Sign-up with onboarding, log-in, and the account area.
(function () {
  var W = window.Writo;
  var page = document.body.dataset.page;
  var $ = function (id) { return document.getElementById(id); };

  function busy(button, on, text) {
    button.disabled = on;
    if (on) { button.dataset.label = button.textContent; button.textContent = text || "Please wait…"; }
    else if (button.dataset.label) button.textContent = button.dataset.label;
  }

  /* ---------- Sign up and onboarding ---------- */
  if (page === "signup") {
    var steps = Array.prototype.slice.call(document.querySelectorAll("[data-step]"));
    var profile = { target_band: null, exam_date: null, save_history: false };
    function go(n) {
      steps.forEach(function (s) { s.hidden = Number(s.dataset.step) !== n; });
      document.querySelectorAll(".dots i").forEach(function (d, i) { d.classList.toggle("on", i <= n); });
      var focus = steps[n].querySelector("input, button");
      if (focus) focus.focus();
    }
    W.me.then(function (me) { if (me.user) { if (me.user.onboarded) location.href = "/account"; else go(1); } });

    $("signup-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var b = this.querySelector("button[type=submit]"), err = $("signup-err");
      err.hidden = true;
      var email = $("email").value.trim(), pass = $("password").value;
      var problem = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? ["email", "Enter a valid email address."]
        : pass.length < 8 ? ["password", "Use a password of at least 8 characters."]
        : !$("consent").checked ? ["consent", "Tick the box to agree to the Terms of use and Privacy policy."]
        : null;
      if (problem) { W.alert(err, "err", problem[1]); $(problem[0]).focus(); return; }
      busy(b, true, "Creating your account…");
      W.api("/api/auth/signup", { email: $("email").value, password: $("password").value, consent: $("consent").checked }).then(function (r) {
        busy(b, false);
        if (!r._ok) { W.alert(err, "err", r.error); if (r._status === 409) err.innerHTML += ' <a href="/login">Log in</a>'; return; }
        go(1);
      });
    });

    document.querySelectorAll(".bands button").forEach(function (b) {
      b.addEventListener("click", function () {
        document.querySelectorAll(".bands button").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", "true");
        profile.target_band = Number(b.dataset.band);
      });
    });
    document.querySelectorAll("[data-next]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.dataset.next === "3" && $("exam").value) profile.exam_date = $("exam").value;
        go(Number(b.dataset.next));
      });
    });
    $("finish").addEventListener("click", function () {
      var b = this;
      profile.save_history = $("history").checked;
      profile.onboarded = true;
      busy(b, true, "Saving…");
      W.api("/api/account/profile", profile).then(function (r) {
        if (!r._ok) { busy(b, false); W.alert($("finish-err"), "err", r.error); return; }
        var pending = null;
        try { pending = JSON.parse(localStorage.getItem("writo-pending") || "null"); } catch (e) {}
        var next = function () { try { localStorage.removeItem("writo-pending"); } catch (e) {} location.href = "/account"; };
        if (pending && profile.save_history) W.api("/api/account/save-check", pending).then(next); else next();
      });
    });
  }

  /* ---------- Log in ---------- */
  if (page === "login") {
    W.me.then(function (me) { if (me.user) location.href = "/account"; });
    $("login-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var b = this.querySelector("button[type=submit]"), err = $("login-err");
      err.hidden = true;
      busy(b, true, "Logging in…");
      W.api("/api/auth/login", { email: $("email").value, password: $("password").value }).then(function (r) {
        busy(b, false);
        if (!r._ok) { W.alert(err, "err", r.error); return; }
        location.href = r.onboarded ? "/account" : "/signup";
      });
    });
  }

  /* ---------- Account ---------- */
  if (page === "account") {
    W.me.then(function (me) {
      if (!me.user) { location.href = "/login"; return; }
      var u = me.user;
      $("account").hidden = false;
      $("hello").textContent = u.email;
      $("left-today").textContent = me.remaining + " of " + me.limits.user + " free checks left today";
      $("target").value = u.target_band || "";
      $("exam").value = u.exam_date || "";
      $("plan").textContent = u.plan === "free" ? "Free plan: " + me.limits.user + " checks a day" : "Unlimited";
      $("since").textContent = "Member since " + W.date(u.created_at);
      $("history-toggle").checked = u.save_history;
      if (u.exam_date) {
        var days = Math.ceil((new Date(u.exam_date) - new Date()) / 86400000);
        if (days >= 0) $("countdown").textContent = days === 0 ? "Your exam is today. Good luck!" : days + (days === 1 ? " day" : " days") + " until your exam";
      }
      loadHistory(u);
    });

    var tabs = document.querySelectorAll(".tabs button");
    function showTab(name) {
      tabs.forEach(function (t) { t.setAttribute("aria-selected", String(t.dataset.tab === name)); });
      document.querySelectorAll("[data-panel]").forEach(function (p) { p.hidden = p.dataset.panel !== name; });
    }
    tabs.forEach(function (t) { t.addEventListener("click", function () { showTab(t.dataset.tab); history.replaceState(null, "", "#" + t.dataset.tab); }); });
    if (/^#(profile|privacy)$/.test(location.hash)) showTab(location.hash.slice(1));

    function loadHistory(u) {
      var list = $("history-list");
      if (!u.save_history) {
        list.innerHTML = '<p class="muted">History is off, so your essays are not stored. You can turn it on in <a href="#privacy" data-goto="privacy">Privacy settings</a>.</p>';
        list.querySelector("[data-goto]").addEventListener("click", function (e) { e.preventDefault(); showTab("privacy"); });
        return;
      }
      W.api("/api/account/checks").then(function (r) {
        var checks = (r.checks || []);
        if (!checks.length) { list.innerHTML = '<p class="muted">No checks yet. <a href="/#check">Check your first essay</a> and it will appear here.</p>'; return; }
        drawChart(checks.slice().reverse(), u.target_band);
        list.innerHTML = '<ul class="history">' + checks.map(function (c, i) {
          return '<li><div><b>' + W.esc(c.task ? c.task.slice(0, 90) + (c.task.length > 90 ? "…" : "") : "Essay without a task") + '</b></div><span class="band">' + W.band(c.overall) + '</span><div class="muted small">' + W.date(c.created_at) + " · " + c.essay.split(/\s+/).length + ' words · <a href="#" data-open="' + i + '">Open</a></div></li>';
        }).join("") + "</ul>";
        list.querySelectorAll("[data-open]").forEach(function (a) {
          a.addEventListener("click", function (e) {
            e.preventDefault();
            var c = checks[Number(a.dataset.open)];
            try { localStorage.setItem("writo-draft", JSON.stringify({ essay: c.essay, task: c.task || "" })); } catch (x) {}
            location.href = "/#check";
          });
        });
      });
    }

    function drawChart(checks, target) {
      var svg = $("chart");
      if (checks.length < 2) { svg.hidden = true; return; }
      var w = 600, h = 180, pad = 28;
      var pts = checks.map(function (c, i) {
        var mid = (c.overall.low + c.overall.high) / 2;
        return [pad + i * (w - 2 * pad) / (checks.length - 1), h - pad - (mid - 4) / 5 * (h - 2 * pad)];
      });
      var y = function (b) { return h - pad - (b - 4) / 5 * (h - 2 * pad); };
      var grid = [5, 6, 7, 8].map(function (b) { return '<line x1="' + pad + '" x2="' + (w - pad) + '" y1="' + y(b) + '" y2="' + y(b) + '" stroke="var(--rule)"/><text x="4" y="' + (y(b) + 4) + '" font-size="11" fill="var(--ink-2)">' + b + "</text>"; }).join("");
      var goal = target ? '<line x1="' + pad + '" x2="' + (w - pad) + '" y1="' + y(target) + '" y2="' + y(target) + '" stroke="var(--olive)" stroke-dasharray="5 5"/><text x="' + (w - pad) + '" y="' + (y(target) - 6) + '" text-anchor="end" font-size="11" fill="var(--olive)">Goal ' + Number(target).toFixed(1) + "</text>" : "";
      svg.setAttribute("viewBox", "0 0 " + w + " " + h);
      svg.innerHTML = grid + goal + '<polyline fill="none" stroke="var(--pen)" stroke-width="2.5" stroke-linejoin="round" points="' + pts.map(function (p) { return p.join(","); }).join(" ") + '"/>' +
        pts.map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4" fill="var(--sheet)" stroke="var(--pen)" stroke-width="2"/>'; }).join("");
      svg.hidden = false;
    }

    $("profile-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var b = this.querySelector("button[type=submit]");
      busy(b, true, "Saving…");
      W.api("/api/account/profile", { target_band: $("target").value || null, exam_date: $("exam").value || null }).then(function (r) {
        busy(b, false);
        if (!r._ok) { W.alert($("profile-msg"), "err", r.error); return; }
        $("profile-msg").hidden = true;
        W.toast("Profile saved");
      });
    });

    $("history-toggle").addEventListener("change", function () {
      var on = this.checked, box = this;
      W.api("/api/account/profile", { save_history: on }).then(function (r) {
        if (!r._ok) { box.checked = !on; W.toast(r.error); return; }
        W.toast(on ? "History is on. New checks will be saved." : "History is off. New checks will not be saved.");
      });
    });

    $("export").addEventListener("click", function () { location.href = "/api/account/export"; });

    $("delete-essays").addEventListener("click", function () {
      if (!confirm("Delete all saved essays and results? This cannot be undone.")) return;
      W.api("/api/account/delete-essays", {}).then(function (r) {
        if (!r._ok) { W.toast(r.error); return; }
        W.toast("All saved essays deleted");
        $("history-list").innerHTML = '<p class="muted">No saved essays.</p>';
        $("chart").hidden = true;
      });
    });

    $("delete-form").addEventListener("submit", function (e) {
      e.preventDefault();
      if (!confirm("Delete your account and all your data forever?")) return;
      var b = this.querySelector("button[type=submit]");
      busy(b, true, "Deleting…");
      W.api("/api/account/delete", { password: $("delete-password").value }).then(function (r) {
        busy(b, false);
        if (!r._ok) { W.alert($("delete-msg"), "err", r.error); return; }
        try { localStorage.removeItem("writo-pending"); } catch (x) {}
        location.href = "/?deleted=1";
      });
    });

    $("logout").addEventListener("click", function () { W.logout(); });
  }
})();
