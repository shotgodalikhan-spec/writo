// Site feedback: POST /api/feedback
//  kind "rating"  - the box under a result: rating 1-4 (faces) or 5 (heart) and an optional comment
//  kind "idea"    - "What would you like us to add?" (text required)
//  kind "problem" - "What should we fix or improve?" (text required)
// The "feedback" table is created on first use. Owners read it at /inbox (functions/api/admin/feedback.js).
import { json, readJson, sameOrigin, ipKey } from "../../lib/core.js";

const MAX_PER_DAY = 50; // per network and day, to keep junk out (many students share one network address)
const KINDS = ["rating", "idea", "problem", "interest"]; // "interest" = "I'm interested" in paid plans, no text

const SCHEMA = "CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, ip TEXT NOT NULL, rating INTEGER NOT NULL, text TEXT, band TEXT, page TEXT, kind TEXT)";

// Tables made before ideas/problems existed have no "kind" column: add it once, the first time it is missing.
async function run(db, stmt) {
  try { return await stmt().run(); }
  catch (e) {
    if (!/no column named kind|has no column named kind/i.test(String(e && e.message))) throw e;
    await db.prepare("ALTER TABLE feedback ADD COLUMN kind TEXT").run();
    return stmt().run();
  }
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "Forbidden." }, 403);
  if (!env.DB) return json({ error: "Feedback is not available right now." }, 503);

  let body;
  try { body = await readJson(request, 6000); } catch { return json({ error: "Bad request." }, 400); }

  const id = String(body.id || "");
  const kind = KINDS.includes(body.kind) ? body.kind : "rating";
  const rating = kind === "rating" ? Number(body.rating) : 0;
  const text = String(body.text || "").trim().slice(0, kind === "rating" ? 500 : 1500);
  if (!/^[0-9a-f]{16}$/.test(id)) return json({ error: "Bad request." }, 400);
  if (kind === "rating" && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) return json({ error: "Bad request." }, 400);
  if (kind !== "rating" && kind !== "interest" && text.length < 3) return json({ error: "Please write a few words." }, 400);
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

  // One "I'm interested" per network and day: pressing the button again does not add votes.
  if (kind === "interest") {
    const had = await db.prepare("SELECT id FROM feedback WHERE ip = ? AND kind = 'interest' AND created_at > ?").bind(ip, Date.now() - 24 * 3600 * 1000).first();
    if (had) return json({ ok: true });
  }

  const recent = await db.prepare("SELECT COUNT(*) AS n FROM feedback WHERE ip = ? AND created_at > ?").bind(ip, Date.now() - 24 * 3600 * 1000).first();
  if (recent && recent.n >= MAX_PER_DAY) return json({ error: "Thank you, we already have a lot from you today. Please try again tomorrow." }, 429);

  await run(db, () => db.prepare("INSERT INTO feedback (id, created_at, ip, rating, text, band, page, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, Date.now(), ip, rating, text, band, page, kind));
  return json({ ok: true });
}
