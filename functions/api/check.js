// Writo essay checker: POST /api/check, diagnostics: GET /api/check
import { json, readJson, sameOrigin, getUser } from "../../lib/core.js";
import { LIMITS, quota, spend, cookieHeaders, neuronsUsed } from "../../lib/quota.js";
import { essayHash, findCheck, saveCheck } from "../../lib/checks.js";

// Best model first. Each model gets a time limit, then the next one is tried.
// Late in the day (quota() says mode "light") the best model is skipped: the lighter one costs about half the
// neurons, so more people can be served before the free allowance runs out.
const MODELS = [
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/meta/llama-3.1-8b-instruct-fast",
];
const LIGHT_MODELS = MODELS.slice(1);
const MODEL_TIMEOUT_MS = 20000;

// Daily limits live in lib/quota.js (LIMITS), shared with /api/me.
export { LIMITS };

const CRITERIA = [
  { key: "task_response", name: "Task Response" },
  { key: "coherence_cohesion", name: "Coherence and Cohesion" },
  { key: "lexical_resource", name: "Lexical Resource" },
  { key: "grammar", name: "Grammatical Range and Accuracy" },
];
const MIN_WORDS = 120;
const MAX_WORDS = 500;

const STOPWORDS = new Set("the a an and or but of to in on for with is are was were be been it this that these those people they their there as at by from not can will would should more most some many which who because however also than".split(" "));

export function countWords(text) {
  return (String(text).trim().match(/\S+/g) || []).length;
}

// Cheap check in code, before calling the AI, so junk never costs tokens.
export function looksLikeEnglishEssay(text) {
  const letters = text.match(/\p{L}/gu) || [];
  if (letters.length < 300) return "The text is too short to be an essay.";
  const latin = letters.filter((c) => /[A-Za-z]/.test(c)).length;
  if (latin / letters.length < 0.9) return "Writo checks essays written in English only.";
  const words = (text.toLowerCase().match(/[a-z']+/g) || []);
  if (words.length < MIN_WORDS) return "The text does not look like an essay.";
  const stop = words.filter((w) => STOPWORDS.has(w)).length;
  if (stop / words.length < 0.12) return "The text does not look like English sentences.";
  const unique = new Set(words).size;
  if (unique / words.length < 0.25) return "The text repeats the same words too often to be checked.";
  const sentences = (text.match(/[.!?](\s|$)/g) || []).length;
  if (sentences < 3) return "Please write full sentences with punctuation.";
  return null;
}

export async function onRequestGet({ env }) {
  return json({ ok: true, aiBinding: Boolean(env.AI), database: Boolean(env.DB), models: MODELS });
}

function extractText(out) {
  if (out == null) return "";
  if (typeof out === "string") return out;
  if (typeof out.response === "string") return out.response;
  if (out.response && typeof out.response === "object") return JSON.stringify(out.response);
  if (Array.isArray(out.choices) && out.choices[0]) {
    const c = out.choices[0];
    if (c.message && typeof c.message.content === "string") return c.message.content;
    if (typeof c.text === "string") return c.text;
  }
  if (out.result) return extractText(out.result);
  return JSON.stringify(out);
}

export function parseModelJSON(text) {
  const cleaned = String(text).replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/\x60\x60\x60(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

function toBand(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(9, Math.max(0, n)) : null;
}

function bandRange(raw) {
  const low = Math.floor(raw * 2) / 2;
  return { low, high: Math.min(9, low + 0.5) };
}

const ADVICE = /^\s*(instead|you should|you could|consider|try to|to improve|in order to|it would|it is recommended|the (essay|writer|author|paragraph)|this paragraph|here is|improved|rewrite)/i;

export function cleanRewrite(text) {
  if (typeof text !== "string") return "";
  const t = text.trim().replace(/^["']|["']$/g, "");
  if (ADVICE.test(t) || countWords(t) < 40) return "";
  return t.slice(0, 2500);
}

function buildMessages(task, essay) {
  const system = "You are an experienced, fair IELTS Writing Task 2 examiner. Assess the essay with the public IELTS band descriptors for four criteria: Task Response, Coherence and Cohesion, Lexical Resource, Grammatical Range and Accuracy. Be accurate in BOTH directions: do not inflate weak essays and do not under-mark strong ones. Use the full scale; different essays should get clearly different scores.\n\n" +
    "Band guide (public descriptors, summarised):\n" +
    "- Band 5: position not always clear; ideas limited or not well developed; organisation present but cohesion faulty or mechanical; limited vocabulary with noticeable spelling or word-formation errors; mostly simple sentences, frequent grammar errors.\n" +
    "- Band 6: relevant position, but some ideas underdeveloped or unclear; coherent overall, cohesive devices used but sometimes faulty or overused; adequate vocabulary with some errors in word choice and spelling; mix of simple and complex sentences, some errors that rarely reduce communication.\n" +
    "- Band 7: clear position throughout; main ideas extended and supported, though some may lack focus; logical organisation with clear progression, a range of cohesive devices with some overuse; flexible vocabulary with some less common items, awareness of style and collocation, only occasional errors; a variety of complex structures, frequent error-free sentences, good control of grammar and punctuation.\n" +
    "- Band 8: fully developed, well supported response; sequencing and paragraphing managed well, cohesion used skilfully; wide, fluent and precise vocabulary with rare errors; wide range of structures, the majority of sentences error-free, only occasional slips.\n\n" +
    "Calibration rules:\n" +
    "- Judge what the writer does well, not only the errors. Hedging (\"tend to\", \"appears to\", \"might\"), considering and rejecting an opposing view, and well-extended ideas are band 7+ features.\n" +
    "- Isolated spelling mistakes or a few small slips do NOT pull an otherwise strong essay below band 7 in Lexical Resource or Grammar. Lower the score only when errors are frequent or make the meaning harder to follow.\n" +
    "- Overuse of simple linkers (Firstly, Also, So) or paragraphs that are too long is a band 7 weakness, not a band 5 one.\n" +
    "- If the essay is under 250 words, lower Task Response as an examiner would (usually to 5 or below if well under 250 words), because ideas cannot be fully developed.\n\n" +
    "FIRST decide if the input is a genuine English essay answering a Task 2 style question. If it is not in English, is not an essay, is random text, code, a list, or spam, reply ONLY with: {\"rejected\": true, \"reason\": \"short reason\"}\n\n" +
    "Otherwise reply with ONLY one JSON object, no markdown and no extra text, exactly in this shape:\n" +
    "{\"task_response\":{\"score\":6.0,\"comment\":\"one or two short sentences\"},\"coherence_cohesion\":{\"score\":6.0,\"comment\":\"...\"},\"lexical_resource\":{\"score\":6.0,\"comment\":\"...\"},\"grammar\":{\"score\":6.0,\"comment\":\"...\"},\"mistakes\":[{\"quote\":\"exact words copied from the essay\",\"fix\":\"corrected version\",\"why\":\"short reason\"}],\"rewrite\":\"...\"}\n\n" +
    "Rules: scores are numbers from 0 to 9. \"mistakes\" has at most 3 items; every \"quote\" must be copied exactly from the essay. " +
    "\"rewrite\" must be the WEAKEST paragraph of the essay, fully rewritten one band higher, keeping the same meaning, in English only. Output only the rewritten paragraph itself: no introduction, no advice, no explanation, no quotes around it. All comments in English.";
  const user = (task ? "Task question:\n" + task + "\n\n" : "Task question: not provided. Judge Task Response by how clear and well developed the position is.\n\n") + "Essay:\n" + essay;
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

export function normalize(parsed, essay) {
  const criteria = [];
  for (const c of CRITERIA) {
    const item = parsed[c.key] || {};
    const raw = toBand(typeof item === "number" ? item : item.score);
    if (raw === null) return null;
    criteria.push({ name: c.name, raw, ...bandRange(raw), comment: typeof item.comment === "string" ? item.comment.slice(0, 400) : "" });
  }
  const avg = criteria.reduce((s, c) => s + c.raw, 0) / criteria.length;
  const flat = essay.toLowerCase().replace(/\s+/g, " ");
  const mistakes = (Array.isArray(parsed.mistakes) ? parsed.mistakes : [])
    .filter((m) => m && typeof m.quote === "string" && m.quote.trim().length > 1)
    .filter((m) => flat.includes(m.quote.toLowerCase().replace(/\s+/g, " ").trim()))
    .slice(0, 3)
    .map((m) => ({ quote: m.quote.trim().slice(0, 300), fix: String(m.fix || "").slice(0, 300), why: String(m.why || "").slice(0, 300) }));
  return {
    overall: bandRange(avg),
    criteria: criteria.map(({ raw, ...rest }) => rest),
    mistakes,
    rewrite: cleanRewrite(parsed.rewrite),
  };
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout after " + ms / 1000 + "s")), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function limitError(q) {
  const hours = Math.max(1, Math.round(q.resetInSeconds / 3600));
  const msgs = {
    guest: "You have used your " + LIMITS.guestDevice + " free checks for today. Create a free account to get " + LIMITS.user + " checks every day, or come back in about " + hours + " h.",
    user: "You have used all " + LIMITS.user + " free checks for today. New checks unlock in about " + hours + " h.",
    ip: "Too many checks from your network today. Please try again in about " + hours + " h.",
    global: "Writo is very busy today and has reached its free daily capacity. Please come back in about " + hours + " h.",
  };
  // "limit" names the rule that ran out; the page uses "guest" to offer a free account.
  return json({ error: msgs[q.blockedBy], limit: q.blockedBy, remaining: 0, resetInSeconds: q.resetInSeconds }, 429, cookieHeaders(q));
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "Forbidden." }, 403);
  if (!env.AI) return json({ error: "Server setup problem: the AI binding is missing." }, 500);

  let body;
  try { body = await readJson(request, 30000); } catch { return json({ error: "Bad request." }, 400); }

  const essay = String(body.essay || "").trim();
  const task = String(body.task || "").trim().slice(0, 1000);
  const words = countWords(essay);
  if (words < MIN_WORDS) return json({ error: "Your essay has " + words + " words. Please write at least " + MIN_WORDS + " (Task 2 needs 250+)." }, 400);
  if (words > MAX_WORDS) return json({ error: "Your essay has " + words + " words. The maximum is " + MAX_WORDS + "." }, 400);

  const junk = looksLikeEnglishEssay(essay);
  if (junk) return json({ error: junk, rejected: true }, 422);

  const db = env.DB || null;
  const user = await getUser(env, request);
  const q = await quota(env, request, user);
  const headers = cookieHeaders(q);

  // The same essay again (same text and task, extra spaces ignored): show the saved result, spend nothing.
  // Guests repeat checks from the list on their device; the server stores no guest essays.
  if (db && user) {
    const same = await findCheck(db, user.id, await essayHash(essay, task));
    if (same) {
      return json({ ...JSON.parse(same.result), model: "saved", words, remaining: q.remaining, loggedIn: true, saved: true, already: true, checkedAt: same.created_at }, 200, headers);
    }
  }

  if (q.remaining <= 0) return limitError(q);

  const messages = buildMessages(task, essay);
  const failures = [];

  const light = q.mode === "light";
  const promptChars = messages.reduce((n, m) => n + m.content.length, 0);

  for (const model of light ? LIGHT_MODELS : MODELS) {
    try {
      const out = await withTimeout(env.AI.run(model, { messages, max_tokens: 1800, temperature: 0.2 }), MODEL_TIMEOUT_MS);
      const text = extractText(out);
      const neurons = neuronsUsed(model, out && out.usage, promptChars, text.length); // the model used these even if the answer is not usable
      const parsed = parseModelJSON(text);
      if (parsed && parsed.rejected === true) {
        await spend(db, [], neurons);
        return json({ error: "This does not look like an English Task 2 essay" + (parsed.reason ? " (" + String(parsed.reason).slice(0, 200).replace(/\.$/, "") + ")." : ".") + " Your free checks were not used.", rejected: true }, 422, headers);
      }
      const result = parsed && normalize(parsed, essay);
      if (!result) { await spend(db, [], neurons); failures.push(model + ": unexpected answer format"); continue; }

      await spend(db, q.keys, neurons);
      const response = { ...result, model, light: light || model !== MODELS[0], words, remaining: Math.max(0, q.remaining - 1), loggedIn: Boolean(user), saved: false };

      // Account owners: every check is kept, one record per essay.
      if (db && user) {
        await saveCheck(db, user.id, task, essay, result);
        response.saved = true;
      }
      return json(response, 200, headers);
    } catch (err) {
      failures.push(model + ": " + String((err && err.message) || err).slice(0, 200));
    }
  }

  const all = failures.join(" | ");
  const limitHit = /429|capacity|neuron|quota|exceeded|4006/i.test(all);
  return json({
    error: limitHit
      ? "Writo has used its free AI capacity for today. It resets at 00:00 UTC (05:00 in Kazakhstan). Your free check was not used."
      : "The checker could not get an answer right now. Please try again in a minute. Your free check was not used.",
    detail: all,
  }, limitHit ? 429 : 502, headers);
}
