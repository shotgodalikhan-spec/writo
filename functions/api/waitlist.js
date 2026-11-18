import { json, readJson, sameOrigin, isEmail, ipKey } from "../../lib/core.js";
import { tooManyAttempts, noteAttempt } from "../../lib/attempts.js";

// Early-access list for paid plans. At most 10 sign-ups per network per 15 minutes (uses the existing
// login_attempts counter table), so the list cannot be filled with junk by a script.
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "Forbidden." }, 403);
  if (!env.DB) return json({ error: "The waitlist is not available yet." }, 503);
  let body;
  try { body = await readJson(request, 2000); } catch { return json({ error: "Bad request." }, 400); }
  const email = String(body.email || "").trim().toLowerCase();
  if (!isEmail(email)) return json({ error: "Please enter a valid email address." }, 400);
  const key = "waitlist:" + (await ipKey(env, request));
  if (await tooManyAttempts(env.DB, key, 10)) return json({ error: "Too many requests from your network. Please try again in 15 minutes." }, 429);
  await noteAttempt(env.DB, key);
  await env.DB.prepare("INSERT OR IGNORE INTO waitlist (email, created_at) VALUES (?, ?)").bind(email, Date.now()).run();
  return json({ ok: true });
}
