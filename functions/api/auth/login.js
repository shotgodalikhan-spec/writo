import { json, readJson, sameOrigin, verifyPassword, createSession, ipKey } from "../../../lib/core.js";
import { tooManyAttempts, noteAttempt, clearAttempts } from "../../../lib/attempts.js";

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "Forbidden." }, 403);
  if (!env.DB) return json({ error: "Accounts are not available yet. Please try again later." }, 503);

  let body;
  try { body = await readJson(request, 5000); } catch { return json({ error: "Bad request." }, 400); }
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  const key = "login:" + (await ipKey(env, request));
  if (await tooManyAttempts(env.DB, key, 10)) return json({ error: "Too many login attempts. Please try again in 15 minutes." }, 429);

  const user = email ? await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first() : null;
  const ok = user ? await verifyPassword(password, user.salt, user.password_hash) : false;
  if (!ok) {
    await noteAttempt(env.DB, key);
    return json({ error: "Wrong email or password." }, 401);
  }
  await clearAttempts(env.DB, key);
  const cookie = await createSession(env, user.id);
  return json({ ok: true, onboarded: Boolean(user.onboarded) }, 200, { "set-cookie": cookie });
}
