import { json, sameOrigin, getCookie, sha256Hex, clearSessionCookie, SESSION_COOKIE } from "../../../lib/core.js";

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "Forbidden." }, 403);
  const token = getCookie(request, SESSION_COOKIE);
  if (env.DB && token) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
  }
  return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
}
