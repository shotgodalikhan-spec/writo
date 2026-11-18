// Owner-only feedback inbox: GET /api/admin/feedback
// Only the site owner's account can read it.
// Owner = the account whose id is in OWNER_USER_IDS. An account id is random and cannot be claimed by
// someone else, unlike an email address (sign-up does not verify email ownership).
// Setup, once: log in as yourself, open /inbox, copy the "account id" shown there into OWNER_USER_IDS.
// Until then (list empty) the account with the owner email below is accepted, so the page works on day one.
// Ideas and problem reports are sorted into themes automatically by keywords (English and Russian),
// so the owner sees at a glance what people ask for most. No AI is used, so it costs nothing.
import { json, getUser, sha256Hex } from "../../../lib/core.js";

export const OWNER_USER_IDS = [];
const OWNER_EMAIL_SHA256 = ["3e93bb3339009382a8166ac29f5eca1f6a834a6a0743a449861152fe321160de"]; // setup fallback only

export async function isOwner(user, ids = OWNER_USER_IDS) {
  if (ids.length) return ids.includes(user.id);
  return OWNER_EMAIL_SHA256.includes(await sha256Hex(String(user.email).trim().toLowerCase()));
}

// Theme -> words that point to it. Lower-case; Russian stems match any ending.
export const THEMES = {
  "Task 1 / letters": ["task 1", "task1", "graph", "chart", "letter", "general training", "таск 1", "график", "письм", "диаграм"],
  "Speaking / Reading / Listening": ["speaking", "reading", "listening", "спикинг", "говорен", "чтени", "аудир", "listening"],
  "Score accuracy": ["accura", "wrong score", "too high", "too low", "unfair", "band is", "score is", "точн", "оценк", "балл", "завыш", "заниж", "неправильн"],
  "More checks / limits": ["limit", "more checks", "only 2", "only 5", "free checks", "unlimited", "лимит", "попыт", "больше провер", "мало провер"],
  "Feedback detail": ["explain", "more detail", "examples", "vocabulary", "grammar", "synonym", "suggest", "подробн", "объясн", "пример", "лексик", "граммат", "синоним"],
  "Language / translation": ["russian", "kazakh", "uzbek", "translat", "русск", "казах", "узбек", "перев", "язык"],
  "Speed": ["slow", "fast", "speed", "loading", "долго", "медлен", "быстр", "загруз"],
  "Bugs / errors": ["bug", "error", "broken", "doesn't work", "does not work", "not working", "crash", "failed", "ошибк", "баг", "не работа", "сломал", "вылет"],
  "Design / mobile": ["design", "mobile", "phone", "dark", "button", "font", "colour", "color", "дизайн", "телефон", "кнопк", "шрифт", "цвет", "тёмн", "темн"],
  "Account / login": ["account", "login", "log in", "password", "sign up", "email", "аккаунт", "войти", "вход", "пароль", "регистр", "почт"],
  "Price / payment": ["price", "pay", "paid", "cost", "subscription", "цена", "плат", "стоим", "подписк", "деньг"],
};

// English words must start a word ("fast" matches "faster" but not "breakfast", "pay" matches "payment"
// but not "repay"). Russian stems match anywhere, because Russian words change their endings and prefixes.
const MATCHERS = Object.fromEntries(Object.entries(THEMES).map(([k, words]) => [k, words.map((w) =>
  /[a-z]/.test(w) ? new RegExp("(?:^|[^a-z])" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) : new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))]));

export function themesOf(text) {
  const t = String(text || "").toLowerCase();
  return Object.keys(MATCHERS).filter((k) => MATCHERS[k].some((re) => re.test(t)));
}

export async function onRequestGet({ request, env }) {
  const user = await getUser(env, request);
  if (!user) return json({ error: "Log in with the owner account to see feedback." }, 401);
  if (!(await isOwner(user))) return json({ error: "This page is only for the site owner." }, 403);
  if (!env.DB) return json({ error: "The database is not available." }, 503);

  let rows = [];
  try {
    // SELECT * also works on older tables without the "kind" column.
    const res = await env.DB.prepare("SELECT * FROM feedback ORDER BY created_at DESC LIMIT 1000").all();
    rows = res.results || [];
  } catch (e) {
    if (!/no such table/i.test(String(e && e.message))) throw e; // the table appears with the first message
  }
  const items = rows.map((r) => ({
    created_at: r.created_at, kind: r.kind || "rating", rating: r.rating, text: r.text || "", band: r.band || "", page: r.page || "",
    themes: r.kind === "idea" || r.kind === "problem" || r.text ? themesOf(r.text) : [],
  }));
  const ratings = items.filter((r) => r.kind === "rating");
  const count = (kind) => {
    const list = items.filter((r) => r.kind === kind), by = {};
    for (const r of list) for (const t of r.themes.length ? r.themes : ["Other"]) by[t] = (by[t] || 0) + 1;
    return { total: list.length, themes: Object.entries(by).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n })) };
  };
  const since = Number(new URL(request.url).searchParams.get("since")) || 0;
  return json({
    // Shown only until OWNER_USER_IDS is filled in (see the top of this file).
    setupAccountId: OWNER_USER_IDS.length ? null : user.id,
    ratings: {
      total: ratings.length,
      hearts: ratings.filter((r) => r.rating === 5).length,
      average: ratings.length ? Math.round(ratings.reduce((s, r) => s + r.rating, 0) / ratings.length * 10) / 10 : 0,
      comments: ratings.filter((r) => r.text).length,
    },
    ideas: count("idea"),
    problems: count("problem"),
    newSince: since ? {
      ratings: ratings.filter((r) => r.created_at > since).length,
      ideas: items.filter((r) => r.kind === "idea" && r.created_at > since).length,
      problems: items.filter((r) => r.kind === "problem" && r.created_at > since).length,
    } : null,
    items,
  });
}
