// Saved checks of account owners: one record per essay. The same text and task (ignoring extra spaces)
// is the same essay, compared by SHA-256 computed here in code (the database schema is unchanged).
import { sha256Hex, randomHex } from "./core.js";

export function normalizeText(s) {
  return String(s || "").replace(/[  -​  　]/g, " ").replace(/\s+/g, " ").trim();
}

export function essayHash(essay, task) {
  return sha256Hex(normalizeText(essay) + "\n" + normalizeText(task));
}

// Newest first. Returns rows with their hash.
async function userChecks(db, userId) {
  const rows = await db.prepare("SELECT id, created_at, task, essay, result, overall_low, overall_high FROM checks WHERE user_id = ? ORDER BY created_at DESC").bind(userId).all();
  const list = rows.results || [];
  for (const r of list) r.hash = await essayHash(r.essay, r.task);
  return list;
}

export async function findCheck(db, userId, hash) {
  const list = await userChecks(db, userId);
  return list.find((r) => r.hash === hash) || null;
}

// Insert, or refresh the date and result of the same essay.
export async function saveCheck(db, userId, task, essay, result, at) {
  const when = Number.isFinite(at) && at > 0 && at <= Date.now() ? at : Date.now();
  const hash = await essayHash(essay, task);
  const same = await findCheck(db, userId, hash);
  const json = JSON.stringify(result);
  if (same) {
    await db.prepare("UPDATE checks SET created_at = ?, result = ?, overall_low = ?, overall_high = ? WHERE id = ?")
      .bind(Math.max(when, same.created_at), json, result.overall.low, result.overall.high, same.id).run();
    return { id: same.id, updated: true };
  }
  const id = randomHex(12);
  await db.prepare("INSERT INTO checks (id, user_id, created_at, task, essay, result, overall_low, overall_high) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, userId, when, task, essay, json, result.overall.low, result.overall.high).run();
  return { id, updated: false };
}

// History without repeats: keeps the newest record of each essay and deletes the older copies.
export async function dedupedChecks(db, userId) {
  const list = await userChecks(db, userId);
  const seen = new Set(), keep = [], drop = [];
  for (const r of list) (seen.has(r.hash) ? drop : keep).push(r), seen.add(r.hash);
  if (drop.length) await db.batch(drop.map((r) => db.prepare("DELETE FROM checks WHERE id = ? AND user_id = ?").bind(r.id, userId)));
  return keep;
}
