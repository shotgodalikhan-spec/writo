// Daily free checks. One place for the rules, used by /api/check and /api/me so both always show the same number.
// Counters live in the existing "usage" table (day, key, count) and reset at 00:00 UTC (05:00 in Kazakhstan).
import { hmacHex, getCookie, randomHex, utcDay, secondsToUtcMidnight, ipKey } from "./core.js";

// The free Workers AI plan gives 10,000 "neurons" a day. A check does not cost a fixed amount: it depends on the
// tokens the model really used (about 80 neurons on the light model, 150 to 200 on the 70B model). So the site counts
// real neurons (key "neurons" in the usage table) instead of guessing a number of checks.
//   below neuronsFullModel : the best model answers
//   up to neuronBudget     : a lighter, cheaper model answers (the page says so), so the day lasts longer
//   at neuronBudget        : "capacity reached" until 00:00 UTC. 10% of the allowance stays as a safety margin.
export const LIMITS = {
  guestDevice: 2, // checks per day for one device without an account (anonymous cookie)
  guestIp: 30,    // all guest checks from one IP per day (soft abuse cap: many people share one IP)
  ipAll: 60,      // all checks from one IP per day, guests and accounts together
  user: 5,        // checks per day for one account
  neuronBudget: 9000,
  neuronsFullModel: 7000,
};

// Neurons per million tokens (input, output), from the Cloudflare Workers AI pricing table.
// The 8B "fast" model has no listed price: it is counted at the 70B rate, which can only overestimate.
const RATES = {
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": [26668, 204805],
  "@cf/meta/llama-4-scout-17b-16e-instruct": [24545, 77273],
  "@cf/meta/llama-3.1-8b-instruct-fast": [26668, 204805],
};

// Neurons one answer used. Uses the token counts the model reports; if it reports none, guesses from the text length
// (about 3.5 characters per token, rounded up so the guess is on the safe side).
export function neuronsUsed(model, usage, promptChars, answerChars) {
  const [rin, rout] = RATES[model] || RATES["@cf/meta/llama-3.3-70b-instruct-fp8-fast"];
  const pin = Number(usage && usage.prompt_tokens) || Math.ceil(promptChars / 3.5);
  const pout = Number(usage && usage.completion_tokens) || Math.ceil(answerChars / 3.5);
  return Math.ceil((pin * rin + pout * rout) / 1e6);
}

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
  const rules = [["ip:" + ip, "ip", LIMITS.ipAll]];
  if (user) rules.push(["user:" + user.id, "user", LIMITS.user]);
  else rules.push([dev.key, "guest", LIMITS.guestDevice], ["gip:" + ip, "ip", LIMITS.guestIp]);

  const counts = { neurons: 0 };
  for (const r of rules) counts[r[0]] = 0;
  const db = env.DB || null;
  if (db) {
    const keys = rules.map((r) => r[0]).concat("neurons");
    const rows = await db.prepare("SELECT key, count FROM usage WHERE day = ? AND key IN (" + keys.map(() => "?").join(",") + ")").bind(utcDay(0), ...keys).all();
    for (const row of rows.results || []) counts[row.key] = row.count;
  }

  // Personal limit first, so when several are at 0 the message talks about the person's own checks.
  let remaining = Infinity, blockedBy = null;
  for (const r of rules.slice().reverse()) {
    const left = Math.max(0, r[2] - counts[r[0]]);
    if (left < remaining) { remaining = left; blockedBy = r[1]; }
  }
  // The whole site: when the day's AI allowance is used up, nobody can check until it resets.
  if (counts.neurons >= LIMITS.neuronBudget) { remaining = 0; blockedBy = "global"; }
  return {
    keys: rules.map((r) => r[0]),
    // "full" = best model, "light" = cheaper model for the rest of the day
    mode: counts.neurons < LIMITS.neuronsFullModel ? "full" : "light",
    remaining,
    limit: user ? LIMITS.user : LIMITS.guestDevice,
    blockedBy: remaining === 0 ? blockedBy : null,
    resetInSeconds: secondsToUtcMidnight(),
    setCookie: dev.setCookie,
  };
}

// Counts one successful check under every key, and the neurons it really used under "neurons". Old rows are cleaned up.
export async function spend(db, keys, neurons) {
  if (!db) return;
  const day = utcDay(0);
  const up = "INSERT INTO usage (day, key, count) VALUES (?, ?, ?) ON CONFLICT(day, key) DO UPDATE SET count = count + ?";
  const stmts = keys.map((k) => db.prepare(up).bind(day, k, 1, 1));
  if (neurons > 0) stmts.push(db.prepare(up).bind(day, "neurons", neurons, neurons));
  stmts.push(db.prepare("DELETE FROM usage WHERE day < ?").bind(utcDay(-1)));
  await db.batch(stmts);
}

export function cookieHeaders(q) {
  return q.setCookie ? { "set-cookie": q.setCookie } : undefined;
}
