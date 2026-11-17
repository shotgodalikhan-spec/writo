// Owner-only feedback inbox (/inbox). Data: GET /api/admin/feedback (checks that you are the owner).
(function () {
  var W = window.Writo, box = document.getElementById("inbox");
  var FACE = { 1: "\u{1F61E} Bad", 2: "\u{1F610} So-so", 3: "\u{1F642} Good", 4: "\u{1F604} Great", 5: "❤️ Love it" };
  W.api("/api/admin/feedback").then(function (r) {
    if (!r._ok) {
      box.innerHTML = '<p class="alert err">' + W.esc(r.error) + (r._status === 401 ? ' <a href="/login">Log in</a>' : "") + "</p>";
      return;
    }
    if (!r.count) { box.innerHTML = '<p class="muted">No feedback yet.</p>'; return; }
    box.innerHTML =
      '<p class="inbox-sum"><b>' + r.count + "</b> ratings · <b>" + r.hearts + "</b> hearts · <b>" + r.comments + "</b> comments · average <b>" + r.average + "</b> of 5</p>" +
      '<ul class="history">' + r.feedback.map(function (f) {
        return "<li><div><b>" + FACE[f.rating] + "</b>" + (f.text ? '<p style="margin:6px 0 0">' + W.esc(f.text) + "</p>" : "") + '</div><span class="band">' + W.esc(f.band || "") + '</span><div class="muted small">' + new Date(f.created_at).toLocaleString() + "</div></li>";
      }).join("") + "</ul>";
  });
})();
