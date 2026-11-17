// Daily free checks. One place for the rules, used by /api/check and /api/me so both always show the same number.
// Counters live in the existing "usage" table (day, key, count) and reset at 00:00 UTC (05:00 in Kazakhstan).
import { hmacHex, getCookie, randomHex, utcDay, secondsToUtcMidnight, ipKey } from "./core.js";

// One check on @cf/meta/llama-3.3-70b-instruct-fp8-fast (~1500 input + ~800 output tokens) costs about
// 1500 x 26668/1M + 800 x 204805/1M = ~204 neurons. The free plan gives 10,000 neurons a day = ~49 checks.
// global keeps a ~10% safety margin: 44.
export const LIMITS = {
  guestDevice: 2, // checks per day for one device without an account (anonymous cookie)
  guestIp: 30,    // all guest checks from one IP per day (soft abuse cap: many people share one IP)
  ipAll: 60,      // all checks from one IP per day, guests and accounts together
  user: 5,        // checks per day for one account
  global: 44,     // whole site per day, inside the free Workers AI allowance
};

const DEVICE_COOKIE = "writo_dev";
const YEAR = 365 * 86400;

// Anonymous device ID: a random value in an HttpOnly cookie. The database only sees HMAC(ID, IP_SALT).
async function deviceKey(env, request) {
  let id = getCookie(request, DEVICE_COOKIE);
  let setCookie = null;
  if (!id || !/^[0-9a-f]{32}$/.test(id)) {
    id = randomHex(16);
    setCookie = DEVICE_COOKIE + "=" + id + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + YEAR;
  }
  const secret = env.IP_SALT || "dev-only-salt-set-IP_SALT-in-cloudflare";
  return { key: "dev:" + (await hmacHex(secret, "device:" + id)), setCookie };
}

// Returns how many checks are left now, which rule is the tightest, and the keys to count a new check under.
export async function quota(env, request, user) {
  const ip = await ipKey(env, request);
  const dev = user ? { key: null, setCookie: null } : await deviceKey(env, request);
  const rules = [
    ["global", "global", LIMITS.global],
    ["ip:" + ip, "ip", LIMITS.ipAll],
  ];
  if (user) rules.push(["user:" + user.id, "user", LIMITS.user]);
  else rules.push([dev.key, "guest", LIMITS.guestDevice], ["gip:" + ip, "ip", LIMITS.guestIp]);

  const counts = {};
  for (const r of rules) counts[r[0]] = 0;
  const db = env.DB || null;
  if (db) {
    const keys = rules.map((r) => r[0]);
    const rows = await db.prepare("SELECT key, count FROM usage WHERE day = ? AND key IN (" + keys.map(() => "?").join(",") + ")").bind(utcDay(0), ...keys).all();
    for (const row of rows.results || []) counts[row.key] = row.count;
  }

  // Personal limit first, so when several are at 0 the message talks about the person's own checks.
  let remaining = Infinity, blockedBy = null;
  for (const r of rules.slice().reverse()) {
    const left = Math.max(0, r[2] - counts[r[0]]);
    if (left < remaining) { remaining = left; blockedBy = r[1]; }
  }
  return {
    keys: rules.map((r) => r[0]),
    remaining,
    limit: user ? LIMITS.user : LIMITS.guestDevice,
    blockedBy: remaining === 0 ? blockedBy : null,
    resetInSeconds: secondsToUtcMidnight(),
    setCookie: dev.setCookie,
  };
}

// Counts one successful check under every key. Old rows are cleaned up.
export async function spend(db, keys) {
  if (!db) return;
  const day = utcDay(0);
  const stmts = keys.map((k) => db.prepare("INSERT INTO usage (day, key, count) VALUES (?, ?, 1) ON CONFLICT(day, key) DO UPDATE SET count = count + 1").bind(day, k));
  stmts.push(db.prepare("DELETE FROM usage WHERE day < ?").bind(utcDay(-1)));
  await db.batch(stmts);
}

export function cookieHeaders(q) {
  return q.setCookie ? { "set-cookie": q.setCookie } : undefined;
}
