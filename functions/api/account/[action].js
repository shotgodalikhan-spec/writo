// Account API: /api/account/profile | checks | export | delete-essays | delete | save-check
import { json, readJson, sameOrigin, getUser, publicUser, verifyPassword, clearSessionCookie } from "../../../lib/core.js";
import { saveCheck, dedupedChecks } from "../../../lib/checks.js";

function bad(msg, status) { return json({ error: msg }, status || 400); }

export async function onRequestGet({ request, env, params }) {
  const user = await getUser(env, request);
  if (!user) return bad("Please log in.", 401);

  if (params.action === "checks") {
    // Repeats of the same essay are removed here: only the newest record of each essay stays.
    const rows = (await dedupedChecks(env.DB, user.id)).slice(0, 100);
    return json({ checks: rows.map((r) => ({ id: r.id, created_at: r.created_at, task: r.task, overall: { low: r.overall_low, high: r.overall_high }, result: JSON.parse(r.result), essay: r.essay })) });
  }

  if (params.action === "export") {
    const rows = await env.DB.prepare("SELECT created_at, task, essay, result FROM checks WHERE user_id = ? ORDER BY created_at").bind(user.id).all();
    const data = {
      exported_at: new Date().toISOString(),
      account: publicUser(user),
      checks: (rows.results || []).map((r) => ({ created_at: new Date(r.created_at).toISOString(), task: r.task, essay: r.essay, result: JSON.parse(r.result) })),
      note: "Writo stores only your email, a password hash, your settings and the essays you checked with your account (one copy of each).",
    };
    return new Response(JSON.stringify(data, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8", "content-disposition": "attachment; filename=\"writo-my-data.json\"", "cache-control": "no-store" },
    });
  }
  return bad("Not found.", 404);
}

export async function onRequestPost({ request, env, params }) {
  if (!sameOrigin(request)) return bad("Forbidden.", 403);
  const user = await getUser(env, request);
  if (!user) return bad("Please log in.", 401);

  let body;
  try { body = await readJson(request, 40000); } catch { return bad("Bad request."); }
  const db = env.DB;

  if (params.action === "profile") {
    const fields = [];
    const values = [];
    if ("target_band" in body) {
      const b = body.target_band === null || body.target_band === "" ? null : Number(body.target_band);
      if (b !== null && !(b >= 4 && b <= 9 && Math.round(b * 2) === b * 2)) return bad("Target band must be between 4.0 and 9.0.");
      fields.push("target_band = ?"); values.push(b);
    }
    if ("exam_date" in body) {
      const d = body.exam_date || null;
      if (d !== null && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return bad("Please choose a valid exam date.");
      fields.push("exam_date = ?"); values.push(d);
    }
    if ("save_history" in body) { fields.push("save_history = ?"); values.push(body.save_history ? 1 : 0); }
    if ("onboarded" in body) { fields.push("onboarded = ?"); values.push(body.onboarded ? 1 : 0); }
    if (!fields.length) return bad("Nothing to update.");
    values.push(user.id);
    await db.prepare("UPDATE users SET " + fields.join(", ") + " WHERE id = ?").bind(...values).run();
    const fresh = await db.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first();
    return json({ ok: true, user: publicUser(fresh) });
  }

  // Saves an essay checked on this device before sign-up. The same essay is stored only once.
  if (params.action === "save-check") {
    const essay = String(body.essay || "").slice(0, 6000);
    const task = String(body.task || "").slice(0, 1000);
    const r = body.result;
    if (!essay || !r || !r.overall || typeof r.overall.low !== "number") return bad("Nothing to save.");
    const result = { overall: r.overall, criteria: Array.isArray(r.criteria) ? r.criteria.slice(0, 4) : [], mistakes: Array.isArray(r.mistakes) ? r.mistakes.slice(0, 3) : [], rewrite: String(r.rewrite || "").slice(0, 2500) };
    result.overall = { low: Number(r.overall.low), high: Number(r.overall.high) };
    const out = await saveCheck(db, user.id, task, essay, result, Number(body.checked_at));
    return json({ ok: true, saved: true, updated: out.updated });
  }

  if (params.action === "delete-essays") {
    await db.prepare("DELETE FROM checks WHERE user_id = ?").bind(user.id).run();
    return json({ ok: true });
  }

  if (params.action === "delete") {
    const ok = await verifyPassword(String(body.password || ""), user.salt, user.password_hash);
    if (!ok) return bad("Wrong password. Your account was not deleted.", 401);
    await db.batch([
      db.prepare("DELETE FROM checks WHERE user_id = ?").bind(user.id),
      db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
      db.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
    ]);
    return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
  }

  return bad("Not found.", 404);
}
