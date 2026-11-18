// Writo shared UI: header, footer, theme, session, helpers.
(function () {
  var LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="var(--pen)"/><path d="M8.2 16.8l4.9 4.8L23.6 10" stroke="var(--pen-ink)" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24.6" cy="8.9" r="1.9" fill="var(--marker)"/></svg>';
  var ICONS = {
    light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
    system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>'
  };
  var W = window.Writo = {};

  W.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  };

  W.api = function (path, data, method) {
    var opts = { method: method || (data ? "POST" : "GET"), headers: {}, credentials: "same-origin" };
    if (data) { opts.headers["content-type"] = "application/json"; opts.body = JSON.stringify(data); }
    return fetch(path, opts).then(function (res) {
      return res.json().catch(function () { return { error: "Unexpected server answer (HTTP " + res.status + ")." }; })
        .then(function (body) { body._status = res.status; body._ok = res.ok && !body.error; return body; });
    }, function () { return { error: "No connection. Check your internet and try again.", _ok: false }; });
  };

  W.toast = function (text) {
    var t = document.querySelector(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(W._tt);
    W._tt = setTimeout(function () { t.classList.remove("show"); }, 2600);
  };

  W.alert = function (el, kind, text, detail) {
    if (!el) return;
    el.className = "alert " + kind;
    el.innerHTML = W.esc(text) + (detail ? "<small>" + W.esc(detail) + "</small>" : "");
    el.hidden = false;
  };

  // Theme
  function applyTheme(mode) {
    var dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    document.querySelectorAll(".theme button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.mode === mode)); });
  }
  function getMode() { try { return localStorage.getItem("writo-theme") || "system"; } catch (e) { return "system"; } }
  function setMode(mode) { try { localStorage.setItem("writo-theme", mode); } catch (e) {} applyTheme(mode); }
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () { if (getMode() === "system") applyTheme("system"); });

  var THEME = '<div class="theme" role="group" aria-label="Colour theme">' +
    '<button type="button" data-mode="light" aria-label="Light theme" title="Light">' + ICONS.light + "</button>" +
    '<button type="button" data-mode="dark" aria-label="Dark theme" title="Dark">' + ICONS.dark + "</button>" +
    '<button type="button" data-mode="system" aria-label="Same as system" title="Same as system">' + ICONS.system + "</button></div>";
  // Sound toggle: speaker icon, always available. Header on desktop, inside the menu on phones. Sounds are OFF by default.
  var SND = '<button type="button" class="snd" aria-pressed="false" aria-label="Turn interface sounds on" title="Interface sounds">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path class="w" d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/><path class="x" d="m16 9 5 6m0-6-5 6"/></svg>' +
    '<span class="snd-label">Sound off</span></button>';
  var page = document.body.dataset.page || "";
  function navLink(href, text, key) { return '<a href="' + href + '"' + (page === key ? ' aria-current="page"' : "") + ">" + text + "</a>"; }

  var head = document.createElement("header");
  head.className = "site-head";
  head.innerHTML =
    '<a class="skip" href="#main">Skip to content</a><div class="wrap">' +
    '<a class="brand" href="/" aria-label="Writo home">' + LOGO + "Writo</a>" +
    '<span class="beta" title="Writo is in beta: scores are estimates">BETA</span>' +
    '<nav class="nav" id="nav" aria-label="Main">' + navLink("/#check", "Check an essay", "check") + navLink("/#how", "How it works", "how") + navLink("/guides/", "Guides", "guides") + '<a href="/login" class="m-login">Log in</a>' + THEME + SND + "</nav>" +
    '<div class="head-actions">' +
    SND + THEME +
    '<span id="auth-slot"><a class="btn ghost sm login-link" href="/login">Log in</a> <a class="btn sm" href="/signup">Sign up free</a></span>' +
    '<button class="btn quiet sm menu-btn" type="button" aria-expanded="false" aria-controls="nav">Menu</button>' +
    "</div></div>";
  document.body.prepend(head);

  var foot = document.createElement("footer");
  foot.className = "site-foot";
  foot.innerHTML =
    '<div class="wrap"><div class="foot-grid">' +
    '<div><a class="brand" href="/">' + LOGO + 'Writo</a><p style="margin-top:12px;max-width:26em">Honest, fast feedback on Writing Task 2 essays. Free for students.</p></div>' +
    '<nav aria-label="Product"><strong>Product</strong><a href="/#check">Check an essay</a><a href="/guides/">Guides</a><a href="/account">My account</a><button type="button" class="link-btn foot-link" data-ideas="idea">Suggest an idea</button><button type="button" class="link-btn foot-link" data-ideas="problem">Report a problem</button></nav>' +
    '<nav aria-label="Legal"><strong>Legal</strong><a href="/terms">Terms of use</a><a href="/privacy">Privacy policy</a><a href="/disclaimer">Disclaimer</a><a href="/contact">Contact</a></nav>' +
    "</div>" +
    '<p class="disclaimer">Writo is not affiliated with IELTS, the British Council, IDP or Cambridge University Press &amp; Assessment. Scores are AI estimates for practice, not official results. &copy; ' + new Date().getFullYear() + " Writo</p></div>";
  document.body.appendChild(foot);

  applyTheme(getMode());
  head.querySelectorAll(".theme button").forEach(function (b) { b.addEventListener("click", function () { setMode(b.dataset.mode); }); });
  var menu = head.querySelector(".menu-btn");
  menu.addEventListener("click", function () {
    var nav = document.getElementById("nav");
    var open = nav.classList.toggle("open");
    menu.setAttribute("aria-expanded", String(open));
  });

  // Session state
  W.refreshAuth = function () {
    document.getElementById("auth-slot").innerHTML = '<a class="btn sm" href="/account">My account</a>';
    var m = head.querySelector(".m-login");
    if (m) { m.href = "/account"; m.textContent = "My account"; }
  };
  W.me = W.api("/api/me").then(function (r) {
    var data = r._ok ? r : { user: null, remaining: null };
    if (data.user) W.refreshAuth();
    return data;
  });

  // One-step sign-up used on the home page and on /signup.
  // f = { email, password, consent (inputs), button, error (elements) }.
  // Resolves to { user, saved } on success (saved = how many device checks moved to the account), or null after an error.
  W.signup = function (f) {
    f.error.hidden = true;
    var email = f.email.value.trim(), pass = f.password.value;
    var problem = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? [f.email, "Enter a valid email address."]
      : pass.length < 8 ? [f.password, "Use a password of at least 8 characters."]
      : !f.consent.checked ? [f.consent, "Tick the box to agree to the Terms of use and Privacy policy."]
      : null;
    if (problem) { W.alert(f.error, "err", problem[1]); problem[0].focus(); return Promise.resolve(null); }
    var b = f.button, label = b.textContent;
    b.disabled = true; b.textContent = "Creating your account…";
    var done = function (v) { b.disabled = false; b.textContent = label; return v; };
    return W.api("/api/auth/signup", { email: email, password: pass, consent: true }).then(function (r) {
      if (!r._ok) {
        W.alert(f.error, "err", r.error);
        if (r._status === 409) f.error.innerHTML += ' <a href="/login">Log in</a>';
        return done(null);
      }
      return W.api("/api/account/profile", { save_history: true, onboarded: true }).then(function (p) {
        return W.importDeviceChecks().then(function (saved) { return done({ user: p.user || null, saved: saved }); });
      });
    });
  };

  // Moves the checks kept on this device (guest "My recent checks", and the older single "writo-pending")
  // into the account, one request at a time. The server skips repeats. Checks that failed to save stay on the device.
  W.importDeviceChecks = function () {
    var list = [], left = [];
    try { list = JSON.parse(localStorage.getItem("writo-recent") || "[]") || []; } catch (e) {}
    try {
      var old = JSON.parse(localStorage.getItem("writo-pending") || "null");
      if (old && old.essay) list.push({ essay: old.essay, task: old.task, result: old.result, at: 0 });
    } catch (e) {}
    var saved = 0;
    var step = function (i) {
      if (i >= list.length) {
        try { localStorage.removeItem("writo-pending"); if (left.length) localStorage.setItem("writo-recent", JSON.stringify(left)); else localStorage.removeItem("writo-recent"); } catch (e) {}
        return Promise.resolve(saved);
      }
      var c = list[i];
      return W.api("/api/account/save-check", { essay: c.essay, task: c.task || "", result: c.result, checked_at: c.at || undefined }).then(function (s) {
        if (s._ok) saved++; else left.push(c);
        return step(i + 1);
      });
    };
    return step(0);
  };

  /* ---------- Sound (opt-in) ---------- */
  // Off unless the person turns it on (banner on the first visit, or the speaker icon). The choice is kept in
  // localStorage ("writo-sound": "on" | "off"). Nothing audio-related is created before the person says yes.
  // Sounds are tiny tones made in the browser (Web Audio): no files, very quiet, only for clicks and results.
  var SND_KEY = "writo-sound";
  var Ctx = window.AudioContext || window.webkitAudioContext;
  var sndState = null, sndCtx = null, lastTick = 0, storageOk = true;
  try { sndState = localStorage.getItem(SND_KEY); } catch (e) { storageOk = false; }
  function sndOn() { return sndState === "on" && Boolean(Ctx); }
  function ctx() {
    if (!sndCtx) { try { sndCtx = new Ctx(); } catch (e) { return null; } }
    if (sndCtx.state === "suspended") { try { sndCtx.resume(); } catch (e) {} }
    return sndCtx;
  }
  function tone(freq, start, dur, gain, type) {
    var c = ctx();
    if (!c) return;
    var t = c.currentTime + start, o = c.createOscillator(), g = c.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  var SOUNDS = {
    click: function () { tone(540, 0, 0.06, 0.03); },
    done: function () { tone(660, 0, 0.18, 0.045); tone(880, 0.11, 0.26, 0.04); },
    error: function () { tone(220, 0, 0.18, 0.04, "triangle"); }
  };
  W.sound = function (name) { if (sndOn() && SOUNDS[name]) SOUNDS[name](); };

  function drawSnd() {
    var on = sndOn();
    document.querySelectorAll(".snd").forEach(function (b) {
      b.setAttribute("aria-pressed", String(on));
      b.setAttribute("aria-label", on ? "Turn interface sounds off" : "Turn interface sounds on");
      b.querySelector(".snd-label").textContent = on ? "Sound on" : "Sound off";
    });
  }
  function setSnd(v) {
    sndState = v;
    try { localStorage.setItem(SND_KEY, v); } catch (e) {}
    drawSnd();
    var bn = document.getElementById("snd-banner");
    if (bn) bn.remove();
    if (v === "on") W.sound("click"); // this click is the permission gesture: the audio engine starts here
  }
  if (!Ctx) {
    document.querySelectorAll(".snd").forEach(function (b) { b.remove(); }); // do not offer what cannot work
  } else {
    drawSnd();
    document.addEventListener("click", function (e) {
      var t = e.target.closest && e.target.closest(".snd");
      if (t) { setSnd(sndOn() ? "off" : "on"); return; }
      var d = e.target.closest && e.target.closest("[data-snd]");
      if (d) setSnd(d.getAttribute("data-snd"));
    });
    // A soft tick for buttons, only when sounds are on. Capture phase, so it never waits for page code.
    document.addEventListener("click", function (e) {
      if (!sndOn()) return;
      var t = e.target.closest && e.target.closest("button, a.btn, [role=button], summary, .seg label");
      if (!t || t.disabled || t.classList.contains("snd") || t.hasAttribute("data-snd")) return;
      var now = Date.now();
      if (now - lastTick < 80) return;
      lastTick = now;
      W.sound("click");
    }, true);
    // First visit: a small question, not a pop-up. It plays nothing. Skipped when the browser cannot remember the answer.
    var askSound = function () {
      if (sndState || document.getElementById("snd-banner")) return;
      if (document.querySelector("dialog[open]")) { setTimeout(askSound, 3000); return; }
      var bn = document.createElement("div");
      bn.id = "snd-banner";
      bn.className = "snd-banner";
      bn.setAttribute("role", "region");
      bn.setAttribute("aria-label", "Sound");
      bn.innerHTML = '<p>Turn on soft interface sounds?</p><div><button class="btn sm" type="button" data-snd="on">Turn on</button><button class="btn ghost sm" type="button" data-snd="off">No sound</button></div>';
      document.body.appendChild(bn);
    };
    if (storageOk && !sndState) setTimeout(askSound, 1500);
  }

  /* ---------- Ideas & problems (on every page) ---------- */
  // One button, two kinds: "idea" (what to add) and "problem" (what to fix). Stored by /api/feedback,
  // read by the owner at /inbox, where they are grouped into themes automatically.
  var ideas;
  W.openIdeas = function (kind) {
    if (!ideas) {
      ideas = document.createElement("dialog");
      ideas.className = "gate ideas";
      ideas.setAttribute("aria-labelledby", "ideas-title");
      ideas.innerHTML =
        '<form method="dialog" class="gate-close"><button class="icon-btn" aria-label="Close">×</button></form>' +
        '<h2 id="ideas-title">Help us improve Writo</h2>' +
        '<form id="ideas-form" novalidate>' +
        '<div class="seg" role="radiogroup" aria-label="Type of message">' +
        '<label><input type="radio" name="ideas-kind" value="idea" checked><span>Suggest an idea</span></label>' +
        '<label><input type="radio" name="ideas-kind" value="problem"><span>Report a problem</span></label></div>' +
        '<div class="field"><label for="ideas-text" id="ideas-q">What would you like us to add?</label>' +
        '<textarea id="ideas-text" rows="4" maxlength="1500" required></textarea></div>' +
        '<p class="muted small">Anonymous. Please do not include your email or other personal details.</p>' +
        '<div id="ideas-err" role="alert" hidden></div>' +
        '<button class="btn big" type="submit">Send</button></form>' +
        '<div id="ideas-done" hidden><p class="fb-thanks">Thank you! We read every message and use it to decide what to build next.</p><button class="btn ghost" type="button" id="ideas-more">Send another</button></div>';
      document.body.appendChild(ideas);
      ideas.addEventListener("click", function (e) { if (e.target === ideas) ideas.close(); });
      var Q = {
        idea: ["What would you like us to add?", "For example: Task 1 checks, more examples of better sentences, a vocabulary list…"],
        problem: ["What should we fix or work on?", "What went wrong or felt annoying? On which page, and on phone or computer?"]
      };
      var form = ideas.querySelector("#ideas-form"), text = ideas.querySelector("#ideas-text");
      var setKind = function (k) {
        ideas.querySelector('input[value="' + k + '"]').checked = true;
        ideas.querySelector("#ideas-q").textContent = Q[k][0];
        text.placeholder = Q[k][1];
      };
      ideas._setKind = setKind;
      ideas.querySelectorAll('input[name="ideas-kind"]').forEach(function (r) { r.addEventListener("change", function () { setKind(r.value); }); });
      ideas.querySelector("#ideas-more").addEventListener("click", function () {
        ideas.querySelector("#ideas-done").hidden = true; form.hidden = false; text.value = ""; text.focus();
      });
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var err = ideas.querySelector("#ideas-err"), msg = text.value.trim();
        err.hidden = true;
        if (msg.length < 3) { W.alert(err, "err", "Please write a few words."); text.focus(); return; }
        var b = form.querySelector("button[type=submit]");
        b.disabled = true; b.textContent = "Sending…";
        var id = Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(8)), function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
        var kindNow = ideas.querySelector('input[name="ideas-kind"]:checked').value;
        W.api("/api/feedback", { id: id, kind: kindNow, text: msg, page: location.pathname }).then(function (r) {
          b.disabled = false; b.textContent = "Send";
          if (!r._ok) { W.alert(err, "err", r.error); return; }
          text.value = "";
          form.hidden = true;
          ideas.querySelector("#ideas-done").hidden = false;
          W.sound("done");
        });
      });
    }
    ideas.querySelector("#ideas-done").hidden = true;
    ideas.querySelector("#ideas-form").hidden = false;
    ideas._setKind(kind === "problem" ? "problem" : "idea");
    if (typeof ideas.showModal === "function") { if (!ideas.open) ideas.showModal(); }
    else ideas.setAttribute("open", "");
    ideas.querySelector("#ideas-text").focus();
  };
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-ideas]");
    if (t) { e.preventDefault(); W.openIdeas(t.getAttribute("data-ideas")); }
  });
  var pill = document.createElement("button");
  pill.type = "button";
  pill.className = "ideas-pill";
  pill.setAttribute("data-ideas", "idea");
  pill.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg><span>Ideas &amp; problems</span>';
  document.body.appendChild(pill);

  /* ---------- "I want to improve my writing" window ---------- */
  // Early-access window for deeper lessons (free for students).
  // "Notify me" saves the email in the waitlist (/api/waitlist), "I'm interested" saves a vote without an email
  // (/api/feedback, kind "interest"). Both are read by the owner at /inbox.
  var improve;
  W.openImprove = function () {
    if (!improve) {
      improve = document.createElement("dialog");
      improve.className = "gate improve";
      improve.setAttribute("aria-labelledby", "improve-title");
      improve.innerHTML =
        '<form method="dialog" class="gate-close"><button class="icon-btn" aria-label="Close">×</button></form>' +
        '<h2 id="improve-title">A deeper way to improve is coming</h2>' +
        '<div id="improve-main"><p>We are building lessons based on <b>your own mistakes</b>, progress tracking and a personal AI coach. <b class="gift">Writo is free for students.</b> Leave your email and we will tell you when it is ready.</p>' +
        '<form id="improve-form" novalidate>' +
        '<div class="field"><label for="improve-email">Email for early access</label><input id="improve-email" type="email" autocomplete="email" placeholder="you@gmail.com"></div>' +
        '<p class="muted small" style="margin:0 0 14px">One email when it opens. No spam. See the <a href="/privacy" target="_blank">Privacy policy</a>.</p>' +
        '<div id="improve-err" role="alert" hidden></div>' +
        '<div class="confirm-actions"><button class="btn shine" type="submit">Notify me</button><button class="btn ghost" type="button" id="improve-vote">I\'m interested</button></div>' +
        "</form></div>" +
        '<div id="improve-done" hidden><p class="fb-thanks"></p><button class="btn ghost" type="button" id="improve-close">Close</button></div>';
      document.body.appendChild(improve);
      improve.addEventListener("click", function (e) { if (e.target === improve) improve.close(); });
      improve.querySelector("#improve-close").addEventListener("click", function () { improve.close(); });
      var done = function (msg) {
        improve.querySelector("#improve-main").hidden = true;
        improve.querySelector("#improve-done").hidden = false;
        improve.querySelector("#improve-done .fb-thanks").textContent = msg;
        W.sound("done");
      };
      improve.querySelector("#improve-form").addEventListener("submit", function (e) {
        e.preventDefault();
        var email = improve.querySelector("#improve-email").value.trim(), err = improve.querySelector("#improve-err");
        err.hidden = true;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { W.alert(err, "err", "Enter a valid email address, or press \"I'm interested\"."); improve.querySelector("#improve-email").focus(); return; }
        var b = e.target.querySelector("button[type=submit]");
        b.disabled = true;
        W.api("/api/waitlist", { email: email }).then(function (r) {
          b.disabled = false;
          if (!r._ok) { W.alert(err, "err", r.error); return; }
          done("You are on the list. We will email you once, when it opens.");
        });
      });
      improve.querySelector("#improve-vote").addEventListener("click", function () {
        var b = this, err = improve.querySelector("#improve-err");
        err.hidden = true; b.disabled = true;
        var id = Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(8)), function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
        W.api("/api/feedback", { id: id, kind: "interest", page: location.pathname }).then(function (r) {
          b.disabled = false;
          if (!r._ok) { W.alert(err, "err", r.error); return; }
          done("Thank you! We will build this with people like you in mind.");
        });
      });
    }
    improve.querySelector("#improve-main").hidden = false;
    improve.querySelector("#improve-done").hidden = true;
    improve.querySelector("#improve-err").hidden = true;
    // Logged-in people get their account email filled in; they can change it.
    var em = improve.querySelector("#improve-email");
    W.me.then(function (m) { if (m.user && !em.value) em.value = m.user.email; });
    if (typeof improve.showModal === "function") { if (!improve.open) improve.showModal(); }
    else improve.setAttribute("open", "");
    em.focus({ preventScroll: true });
  };
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-improve]");
    if (t) { e.preventDefault(); W.openImprove(); }
  });

  /* ---------- Owner: new messages badge ---------- */
  // Only in the owner's browser (set when /inbox opens successfully). Others never call the admin API.
  W.me.then(function (m) {
    var owner = false;
    try { owner = localStorage.getItem("writo-owner") === "1"; } catch (e) {}
    if (!m.user || !owner || document.body.dataset.page === "inbox") return;
    var seen = 0;
    try { seen = Number(localStorage.getItem("writo-inbox-seen")) || 0; } catch (e) {}
    W.api("/api/admin/feedback?since=" + seen).then(function (r) {
      if (!r._ok || !r.newSince) return;
      var n = r.newSince.ratings + r.newSince.ideas + r.newSince.problems + (r.newSince.interest || 0);
      if (!n) return;
      var a = document.createElement("a");
      a.className = "inbox-badge";
      a.href = "/inbox";
      a.textContent = "Inbox: " + n + " new";
      a.title = r.newSince.ideas + " ideas, " + r.newSince.problems + " problems, " + r.newSince.ratings + " ratings";
      var slot = document.getElementById("auth-slot");
      slot.parentNode.insertBefore(a, slot);
    });
  });

  W.logout = function () {
    return W.api("/api/auth/logout", {}).then(function () { location.href = "/"; });
  };

  if (/[?&]deleted=1/.test(location.search)) {
    W.toast("Your account and data were deleted");
    history.replaceState(null, "", location.pathname + location.hash);
  }

  W.date = function (ms) {
    return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  };
  W.band = function (r) { return Number(r.low).toFixed(1) + "–" + Number(r.high).toFixed(1); };
})();
