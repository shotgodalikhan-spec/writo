// Site feedback from the box under a check result: POST /api/feedback
// Stores a rating (1-4 faces, 5 = heart) and an optional short comment.
// The "feedback" table is created on first use, so no manual database step is needed.
// Read it in Cloudflare: D1 -> writo-db -> Console -> SELECT * FROM feedback ORDER BY created_at DESC;
import { json, readJson, sameOrigin, ipKey } from "../../lib/core.js";

const MAX_PER_DAY = 10; // per network, to keep junk out

const SCHEMA = "CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, ip TEXT NOT NULL, rating INTEGER NOT NULL, text TEXT, band TEXT, page TEXT)";

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "Forbidden." }, 403);
  if (!env.DB) return json({ error: "Feedback is not available right now." }, 503);

  let body;
  try { body = await readJson(request, 3000); } catch { return json({ error: "Bad request." }, 400); }

  const id = String(body.id || "");
  const rating = Number(body.rating);
  if (!/^[0-9a-f]{16}$/.test(id) || !Number.isInteger(rating) || rating < 1 || rating > 5) return json({ error: "Bad request." }, 400);
  const text = String(body.text || "").trim().slice(0, 500);
  const band = String(body.band || "").slice(0, 20);
  const page = String(body.page || "").slice(0, 60);

  const db = env.DB;
  await db.batch([db.prepare(SCHEMA), db.prepare("DELETE FROM feedback WHERE created_at < ?").bind(Date.now() - 365 * 24 * 3600 * 1000)]);
  const ip = await ipKey(env, request);

  const existing = await db.prepare("SELECT ip FROM feedback WHERE id = ?").bind(id).first();
  if (existing) {
    if (existing.ip !== ip) return json({ error: "Forbidden." }, 403);
    await db.prepare("UPDATE feedback SET rating = ?, text = CASE WHEN ? = '' THEN text ELSE ? END WHERE id = ?").bind(rating, text, text, id).run();
    return json({ ok: true });
  }

  const recent = await db.prepare("SELECT COUNT(*) AS n FROM feedback WHERE ip = ? AND created_at > ?").bind(ip, Date.now() - 24 * 3600 * 1000).first();
  if (recent && recent.n >= MAX_PER_DAY) return json({ error: "Thanks, we already have your feedback for today." }, 429);

  await db.prepare("INSERT INTO feedback (id, created_at, ip, rating, text, band, page) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, Date.now(), ip, rating, text, band, page).run();
  return json({ ok: true });
}
