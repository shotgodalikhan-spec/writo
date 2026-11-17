import { json, getUser, publicUser, ipKey, utcDay } from "../../lib/core.js";
import { LIMITS } from "./check.js";

export async function onRequestGet({ request, env }) {
  const user = await getUser(env, request);
  let remaining = user ? LIMITS.user : LIMITS.guest;
  if (env.DB) {
    const key = user ? "user:" + user.id : "ip:" + (await ipKey(env, request));
    const row = await env.DB.prepare("SELECT count FROM usage WHERE day = ? AND key = ?").bind(utcDay(0), key).first();
    remaining = Math.max(0, remaining - (row ? row.count : 0));
  }
  return json({ user: publicUser(user), remaining, limits: { guest: LIMITS.guest, user: LIMITS.user } });
}
