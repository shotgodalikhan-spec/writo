// Who is logged in and how many free checks are left today (same rules as /api/check, lib/quota.js).
import { json, getUser, publicUser } from "../../lib/core.js";
import { LIMITS, quota, cookieHeaders } from "../../lib/quota.js";

export async function onRequestGet({ request, env }) {
  const user = await getUser(env, request);
  const q = await quota(env, request, user);
  return json({
    user: publicUser(user),
    remaining: q.remaining,
    limits: { guest: LIMITS.guestDevice, user: LIMITS.user },
    limit: q.blockedBy,
    resetInSeconds: q.resetInSeconds,
  }, 200, cookieHeaders(q));
}
