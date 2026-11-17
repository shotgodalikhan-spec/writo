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
  var page = document.body.dataset.page || "";
  function navLink(href, text, key) { return '<a href="' + href + '"' + (page === key ? ' aria-current="page"' : "") + ">" + text + "</a>"; }

  var head = document.createElement("header");
  head.className = "site-head";
  head.innerHTML =
    '<a class="skip" href="#main">Skip to content</a><div class="wrap">' +
    '<a class="brand" href="/" aria-label="Writo home">' + LOGO + "Writo</a>" +
    '<span class="beta" title="Writo is in beta: scores are estimates">BETA</span>' +
    '<nav class="nav" id="nav" aria-label="Main">' + navLink("/#check", "Check an essay", "check") + navLink("/#how", "How it works", "how") + navLink("/pricing", "Pricing", "pricing") + navLink("/guides/", "Guides", "guides") + '<a href="/login" class="m-login">Log in</a>' + THEME + "</nav>" +
    '<div class="head-actions">' +
    THEME +
    '<span id="auth-slot"><a class="btn ghost sm login-link" href="/login">Log in</a> <a class="btn sm" href="/signup">Sign up free</a></span>' +
    '<button class="btn quiet sm menu-btn" type="button" aria-expanded="false" aria-controls="nav">Menu</button>' +
    "</div></div>";
  document.body.prepend(head);

  var foot = document.createElement("footer");
  foot.className = "site-foot";
  foot.innerHTML =
    '<div class="wrap"><div class="foot-grid">' +
    '<div><a class="brand" href="/">' + LOGO + 'Writo</a><p style="margin-top:12px;max-width:26em">Honest, fast feedback on Writing Task 2 essays. No hidden charges, no lost text.</p></div>' +
    '<nav aria-label="Product"><strong>Product</strong><a href="/#check">Check an essay</a><a href="/pricing">Pricing</a><a href="/guides/">Guides</a><a href="/account">My account</a></nav>' +
    '<nav aria-label="Legal"><strong>Legal</strong><a href="/terms">Terms of use</a><a href="/privacy">Privacy policy</a><a href="/refund">Refund policy</a><a href="/disclaimer">Disclaimer</a><a href="/contact">Contact</a></nav>' +
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
  // f = { email, password, consent, history (inputs), button, error (elements) }.
  // Resolves to { user, saved } on success, or null after showing an error.
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
    var keep = f.history ? f.history.checked : true;
    return W.api("/api/auth/signup", { email: email, password: pass, consent: true }).then(function (r) {
      if (!r._ok) {
        W.alert(f.error, "err", r.error);
        if (r._status === 409) f.error.innerHTML += ' <a href="/login">Log in</a>';
        return done(null);
      }
      return W.api("/api/account/profile", { save_history: keep, onboarded: true }).then(function (p) {
        var pending = null;
        try { pending = JSON.parse(localStorage.getItem("writo-pending") || "null"); } catch (e) {}
        var finish = function (saved) {
          try { localStorage.removeItem("writo-pending"); } catch (e) {}
          return done({ user: p.user || null, saved: saved });
        };
        if (!keep || !pending || !p._ok) return finish(false);
        return W.api("/api/account/save-check", pending).then(function (s) { return finish(Boolean(s._ok && s.saved)); });
      });
    });
  };

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
