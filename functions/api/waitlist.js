import { json, readJson, sameOrigin, isEmail } from "../../lib/core.js";

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "Forbidden." }, 403);
  if (!env.DB) return json({ error: "The waitlist is not available yet." }, 503);
  let body;
  try { body = await readJson(request, 2000); } catch { return json({ error: "Bad request." }, 400); }
  const email = String(body.email || "").trim().toLowerCase();
  if (!isEmail(email)) return json({ error: "Please enter a valid email address." }, 400);
  await env.DB.prepare("INSERT OR IGNORE INTO waitlist (email, created_at) VALUES (?, ?)").bind(email, Date.now()).run();
  return json({ ok: true });
}
