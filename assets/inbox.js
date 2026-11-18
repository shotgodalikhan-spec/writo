// Owner-only feedback inbox (/inbox). Data: GET /api/admin/feedback (the server checks that you are the owner).
// Shows a short automatic summary first (what people ask for most), then every message, newest first.
// Messages that arrived since your last visit are marked "new".
(function () {
  var W = window.Writo, box = document.getElementById("inbox");
  var FACE = { 1: "\u{1F61E} Bad", 2: "\u{1F610} So-so", 3: "\u{1F642} Good", 4: "\u{1F604} Great", 5: "❤️ Love it" };
  var KIND = { idea: "Idea", problem: "Problem", rating: "Rating" };
  var seen = 0;
  try { seen = Number(localStorage.getItem("writo-inbox-seen")) || 0; } catch (e) {}

  W.api("/api/admin/feedback?since=" + seen).then(function (r) {
    if (!r._ok) {
      box.innerHTML = '<p class="alert err">' + W.esc(r.error) + (r._status === 401 ? ' <a href="/login">Log in</a>' : "") + "</p>";
      return;
    }
    // This browser belongs to the owner: show the "new" badge in the header on other pages, and remember this visit.
    try { localStorage.setItem("writo-owner", "1"); localStorage.setItem("writo-inbox-seen", String(Date.now())); } catch (e) {}

    // One-time setup: shows your account id so it can be pinned in the code (blocks anyone else from claiming the owner email).
    var setup = r.setupAccountId ? '<p class="alert ok">Setup, one time: your account id is <b>' + W.esc(r.setupAccountId) + "</b>. Send it to Claude so access can be tied to your account.</p>" : "";

    if (!r.items.length) { box.innerHTML = setup + '<p class="muted">No messages yet. They will appear here as soon as someone rates a check or sends an idea.</p>'; return; }

    var n = r.newSince || { ratings: 0, ideas: 0, problems: 0 };
    var newTotal = n.ratings + n.ideas + n.problems;
    var top = function (g) {
      return g.themes.length ? "<ol>" + g.themes.slice(0, 5).map(function (t) { return "<li><b>" + W.esc(t.name) + "</b> — " + t.n + "</li>"; }).join("") + "</ol>" : '<p class="muted small">Nothing yet.</p>';
    };
    var summary =
      '<div class="inbox-sum">' +
      (seen ? '<p class="inbox-new">' + (newTotal ? "Since your last visit: <b>" + n.ideas + "</b> ideas, <b>" + n.problems + "</b> problems, <b>" + n.ratings + "</b> ratings." : "Nothing new since your last visit.") + "</p>" : "") +
      '<div class="inbox-cols">' +
      "<section><h2>Ratings</h2><p><b>" + r.ratings.total + "</b> ratings, average <b>" + r.ratings.average + "</b> of 5<br><b>" + r.ratings.hearts + "</b> hearts, <b>" + r.ratings.comments + "</b> with a comment</p></section>" +
      "<section><h2>Ideas (" + r.ideas.total + ")</h2><p class=\"muted small\">Most asked for:</p>" + top(r.ideas) + "</section>" +
      "<section><h2>Problems (" + r.problems.total + ")</h2><p class=\"muted small\">Most reported:</p>" + top(r.problems) + "</section>" +
      "</div></div>";

    var filter = '<div class="seg inbox-filter" role="radiogroup" aria-label="Show">' +
      ["all", "idea", "problem", "rating"].map(function (k, i) {
        return '<label><input type="radio" name="inbox-show" value="' + k + '"' + (i ? "" : " checked") + "><span>" + (k === "all" ? "All" : KIND[k] + "s") + "</span></label>";
      }).join("") + "</div>";

    box.innerHTML = setup + summary + filter + '<ul class="history inbox-list" id="inbox-list"></ul>';
    var draw = function (k) {
      var list = r.items.filter(function (f) { return k === "all" || f.kind === k; });
      document.getElementById("inbox-list").innerHTML = list.length ? list.map(function (f) {
        var head = f.kind === "rating" ? FACE[f.rating] || "Rating" : KIND[f.kind];
        var isNew = seen && f.created_at > seen;
        return '<li class="k-' + f.kind + '"><div><b>' + W.esc(head) + "</b>" + (isNew ? ' <span class="new-tag">new</span>' : "") +
          (f.text ? '<p class="inbox-text">' + W.esc(f.text) + "</p>" : "") +
          (f.themes.length ? '<p class="tags">' + f.themes.map(function (t) { return "<span>" + W.esc(t) + "</span>"; }).join("") + "</p>" : "") +
          '</div><span class="band">' + W.esc(f.band) + '</span><div class="muted small">' + new Date(f.created_at).toLocaleString() + (f.page ? " · " + W.esc(f.page) : "") + "</div></li>";
      }).join("") : '<li class="muted">Nothing here yet.</li>';
    };
    box.querySelectorAll('input[name="inbox-show"]').forEach(function (i) { i.addEventListener("change", function () { draw(i.value); }); });
    draw("all");
  });
})();
