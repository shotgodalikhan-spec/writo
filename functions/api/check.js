// Writo — essay checker (Cloudflare Pages Function)
// Models are tried in order. If one fails, the next one is used.
const MODELS = [
  "@cf/google/gemma-4-26b-a4b-it",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/meta/llama-3.1-8b-instruct-fast",
];

const CRITERIA = [
  { key: "task_response", name: "Task Response" },
  { key: "coherence_cohesion", name: "Coherence and Cohesion" },
  { key: "lexical_resource", name: "Lexical Resource" },
  { key: "grammar", name: "Grammatical Range and Accuracy" },
];

const MIN_WORDS = 120;
const MAX_WORDS = 500;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

// Open https://YOUR-SITE.pages.dev/api/check in the browser to test the setup.
export async function onRequestGet({ env }) {
  return json({
    ok: true,
    aiBinding: Boolean(env && env.AI),
    hint: env && env.AI
      ? "AI binding is connected."
      : "AI binding is MISSING. Add Workers AI binding with variable name AI, then redeploy.",
    models: MODELS,
  });
}

function countWords(text) {
  return (text.trim().match(/\S+/g) || []).length;
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

function parseModelJSON(text) {
  const cleaned = String(text)
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function toBand(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(9, Math.max(0, n));
}

// Raw 6.3 -> range 6.0–6.5
function bandRange(raw) {
  const low = Math.floor(raw * 2) / 2;
  const high = Math.min(9, low + 0.5);
  return { low, high };
}

function buildPrompt(task, essay) {
  const system = `You are an experienced IELTS Writing Task 2 examiner. Assess the essay using the public IELTS band descriptors for four criteria: Task Response, Coherence and Cohesion, Lexical Resource, Grammatical Range and Accuracy. Be strict and realistic; do not inflate scores.

Reply with ONLY one JSON object, no markdown, no extra text, in exactly this shape:
{
  "task_response": {"score": 6.0, "comment": "one or two short sentences"},
  "coherence_cohesion": {"score": 6.0, "comment": "..."},
  "lexical_resource": {"score": 6.0, "comment": "..."},
  "grammar": {"score": 6.0, "comment": "..."},
  "mistakes": [
    {"quote": "exact words copied from the essay", "fix": "corrected version", "why": "short reason"}
  ],
  "rewrite": "the weakest paragraph of the essay rewritten at a higher band"
}
Rules: scores are numbers from 0 to 9. "mistakes" has at most 3 items, and every "quote" must be copied exactly from the essay. All comments in English.`;

  const user = `${task ? `Task question:\n${task}\n\n` : "Task question: not provided. Judge Task Response by how clear and well-developed the position is.\n\n"}Essay:\n${essay}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function normalize(parsed, essay) {
  const criteria = [];
  for (const c of CRITERIA) {
    const item = parsed[c.key] || {};
    const raw = toBand(typeof item === "number" ? item : item.score);
    if (raw === null) return null; // model skipped a criterion -> treat as bad format
    criteria.push({
      name: c.name,
      ...bandRange(raw),
      comment: typeof item.comment === "string" ? item.comment.slice(0, 400) : "",
      raw,
    });
  }

  const avg = criteria.reduce((s, c) => s + c.raw, 0) / criteria.length;
  const essayLower = essay.toLowerCase().replace(/\s+/g, " ");

  const mistakes = (Array.isArray(parsed.mistakes) ? parsed.mistakes : [])
    .filter((m) => m && typeof m.quote === "string" && m.quote.trim().length > 1)
    .filter((m) => essayLower.includes(m.quote.toLowerCase().replace(/\s+/g, " ").trim()))
    .slice(0, 3)
    .map((m) => ({
      quote: m.quote.trim().slice(0, 300),
      fix: String(m.fix || "").slice(0, 300),
      why: String(m.why || "").slice(0, 300),
    }));

  return {
    overall: bandRange(avg),
    criteria: criteria.map(({ raw, ...rest }) => rest),
    mistakes,
    rewrite: typeof parsed.rewrite === "string" ? parsed.rewrite.slice(0, 2000) : "",
  };
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.AI) {
    return json({
      error: "Server setup problem: the AI binding is missing.",
      detail: "Cloudflare → Workers & Pages → writo → Settings → Bindings → Add → Workers AI, variable name AI. Then redeploy.",
    }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Bad request." }, 400);
  }

  const essay = String(body.essay || "").trim();
  const task = String(body.task || "").trim().slice(0, 1000);
  const words = countWords(essay);

  if (words < MIN_WORDS) return json({ error: `Essay is too short: ${words} words. Minimum is ${MIN_WORDS}.` }, 400);
  if (words > MAX_WORDS) return json({ error: `Essay is too long: ${words} words. Maximum is ${MAX_WORDS}.` }, 400);

  const messages = buildPrompt(task, essay);
  const failures = [];

  for (const model of MODELS) {
    try {
      const out = await env.AI.run(model, { messages, max_tokens: 2000, temperature: 0.2 });
      const text = extractText(out);
      const parsed = parseModelJSON(text);
      const result = parsed && normalize(parsed, essay);
      if (result) {
        return json({ ...result, model, words });
      }
      failures.push(`${model}: answer was not in the expected format`);
      console.log("Bad format from", model, text.slice(0, 500));
    } catch (err) {
      const msg = String((err && err.message) || err).slice(0, 300);
      failures.push(`${model}: ${msg}`);
      console.log("Model error", model, msg);
    }
  }

  const all = failures.join(" | ");
  const limitHit = /429|capacity|limit|neuron|quota|exceeded/i.test(all);

  return json({
    error: limitHit
      ? "The free daily limit is used up. It resets every day at 00:00 UTC (05:00 in Kazakhstan). Try again later."
      : "The checker could not get an answer from the AI models.",
    detail: all,
  }, limitHit ? 429 : 502);
}
