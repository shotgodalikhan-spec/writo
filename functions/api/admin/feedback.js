// Owner-only feedback inbox: GET /api/admin/feedback
// Only the site owner's account can read it. The owner is identified by the SHA-256 of their
// account email, so the email itself is not written in this public code.
import { json, getUser, sha256Hex } from "../../../lib/core.js";

const OWNER_EMAIL_SHA256 = ["3e93bb3339009382a8166ac29f5eca1f6a834a6a0743a449861152fe321160de"];

export async function onRequestGet({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: "Log in with the owner account to see feedback." }, 401);
  if (!OWNER_EMAIL_SHA256.includes(await sha256Hex(String(user.email).trim().toLowerCase()))) return json({ error: "This page is only for the site owner." }, 403);
  if (!env.DB) return json({ error: "The database is not available." }, 503);

  let rows = [];
  try {
    const res = await env.DB.prepare("SELECT created_at, rating, text, band, page FROM feedback ORDER BY created_at DESC LIMIT 500").all();
    rows = res.results || [];
  } catch (e) {
    // The table appears with the first piece of feedback.
    if (!/no such table/i.test(String(e && e.message))) throw e;
  }
  const count = rows.length;
  const hearts = rows.filter((r) => r.rating === 5).length;
  const avg = count ? rows.reduce((s, r) => s + r.rating, 0) / count : 0;
  return json({ count, hearts, comments: rows.filter((r) => r.text).length, average: Math.round(avg * 10) / 10, feedback: rows });
}
