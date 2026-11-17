// Shared server helpers for Writo (imported by Pages Functions).
// Note: this file has no secrets. Secrets live in Cloudflare (env.IP_SALT).

export const SESSION_COOKIE = "writo_session";
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100000; // Workers maximum for PBKDF2
const enc = new TextEncoder();

export function json(data, status, extraHeaders) {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  if (extraHeaders) for (const [k, v] of Object.entries(extraHeaders)) headers.append(k, v);
  return new Response(JSON.stringify(data), { status: status || 200, headers });
}

export async function readJson(request, maxBytes) {
  const text = await request.text();
  if (text.length > (maxBytes || 20000)) throw new Error("too_large");
  try { return JSON.parse(text || "{}"); } catch { throw new Error("bad_json"); }
}

// Blocks cross-site form posts (CSRF). Same-origin fetch from our pages always passes.
export function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export function toHex(buf) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return toHex(a);
}

export async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

export async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(text)));
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2Hex(password, saltHex, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return toHex(bits);
}

// Stored format: pbkdf2$<iterations>$<hash>. Salt is stored in its own column.
export async function hashPassword(password) {
  const salt = randomHex(16);
  const hash = await pbkdf2Hex(password, salt, PBKDF2_ITERATIONS);
  return { salt, password_hash: "pbkdf2$" + PBKDF2_ITERATIONS + "$" + hash };
}

export async function verifyPassword(password, salt, stored) {
  const parts = String(stored).split("$");
  if (parts.length !== 3 || parts[0] !== "pbkdf2") return false;
  const hash = await pbkdf2Hex(password, salt, Number(parts[1]));
  return safeEqual(hash, parts[2]);
}

export function getCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function cookieHeader(value, maxAge) {
  return SESSION_COOKIE + "=" + value + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + maxAge;
}

export async function createSession(env, userId) {
  const token = randomHex(32);
  const expires = Date.now() + SESSION_DAYS * 86400000;
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256Hex(token), userId, expires).run();
  return cookieHeader(token, SESSION_DAYS * 86400);
}

export function clearSessionCookie() {
  return cookieHeader("", 0);
}

export async function getUser(env, request) {
  if (!env.DB) return null;
  const token = getCookie(request, SESSION_COOKIE);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const row = await env.DB.prepare(
    "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?"
  ).bind(await sha256Hex(token), Date.now()).first();
  return row || null;
}

export function publicUser(u) {
  if (!u) return null;
  return {
    email: u.email,
    created_at: u.created_at,
    target_band: u.target_band,
    exam_date: u.exam_date,
    save_history: Boolean(u.save_history),
    onboarded: Boolean(u.onboarded),
    plan: u.plan,
    plan_status: u.plan_status,
  };
}

export function clientIp(request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
}

// IP is never stored. We keep only HMAC(IP) with a secret, so it cannot be reversed by brute force.
export async function ipKey(env, request) {
  const secret = env.IP_SALT || "dev-only-salt-set-IP_SALT-in-cloudflare";
  return hmacHex(secret, clientIp(request));
}

export function isEmail(s) {
  return typeof s === "string" && s.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

export function utcDay(offsetDays) {
  return new Date(Date.now() + (offsetDays || 0) * 86400000).toISOString().slice(0, 10);
}

export function secondsToUtcMidnight() {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.ceil((next - now.getTime()) / 1000);
}
