import { json, readJson, sameOrigin, isEmail, hashPassword, createSession, randomHex, ipKey } from "../../../lib/core.js";
import { tooManyAttempts, noteAttempt } from "../../../lib/attempts.js";

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "Forbidden." }, 403);
  if (!env.DB) return json({ error: "Accounts are not available yet. Please try again later." }, 503);

  let body;
  try { body = await readJson(request, 5000); } catch { return json({ error: "Bad request." }, 400); }
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!isEmail(email)) return json({ error: "Please enter a valid email address." }, 400);
  if (password.length < 8 || password.length > 200) return json({ error: "Your password must be at least 8 characters." }, 400);
  if (body.consent !== true) return json({ error: "Please accept the Terms and Privacy Policy to create an account." }, 400);

  const key = "signup:" + (await ipKey(env, request));
  if (await tooManyAttempts(env.DB, key, 10)) return json({ error: "Too many sign-up attempts. Please try again in 15 minutes." }, 429);
  await noteAttempt(env.DB, key);

  const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (exists) return json({ error: "An account with this email already exists. Please log in." }, 409);

  const id = randomHex(12);
  const { salt, password_hash } = await hashPassword(password);
  await env.DB.prepare("INSERT INTO users (id, email, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, email, password_hash, salt, Date.now()).run();

  const cookie = await createSession(env, id);
  return json({ ok: true }, 201, { "set-cookie": cookie });
}
