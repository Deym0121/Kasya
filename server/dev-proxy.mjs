// Kasya local AI proxy.
//
// Keeps your OpenRouter key OFF the client. The app POSTs de-identified gait
// features here; this server adds the key and calls OpenRouter. The same logic
// drops into a Supabase Edge Function for production.
//
// Run:  npm run server     (loads .env via --env-file)
// Needs in .env:  OPENROUTER_API_KEY=...   (optional: OPENROUTER_MODEL, AI_PROXY_PORT)
import { createServer } from 'node:http';

const KEY = process.env.OPENROUTER_API_KEY;
// Default to a small, cheap, recent model. Override with OPENROUTER_MODEL if the
// exact id isn't available on your OpenRouter account.
const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-5-mini';
const PORT = Number(process.env.AI_PROXY_PORT || 8787);
// Bind to loopback by default so the dev proxy (which spends the key) isn't
// reachable across the LAN. Override with AI_PROXY_HOST=0.0.0.0 only if needed.
const HOST = process.env.AI_PROXY_HOST || '127.0.0.1';

// Optional hardening (all default open/permissive for local dev):
// - PROXY_AUTH_TOKEN: when set, every request must send it as x-proxy-token.
// - ALLOWED_ORIGIN: locks CORS to one origin instead of *.
// - TRUST_PROXY=1: only honor X-Forwarded-For for rate limiting when set
//   (behind a real proxy); otherwise the client could pick its own IP.
const AUTH_TOKEN = process.env.PROXY_AUTH_TOKEN || '';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

// Payload caps — gait features + a short chat history are tiny, so anything
// big is a mistake or abuse. Upstream timeout keeps a hung OpenRouter call
// from pinning the client's spinner forever.
const MAX_BODY_BYTES = 64 * 1024;
const MAX_FEATURES_BYTES = 16 * 1024;
const UPSTREAM_TIMEOUT_MS = 30000;

// Rate limit — protect the key/cost. Fixed 60s window, per-IP + a global cap.
const RL = {
  windowMs: Number(process.env.AI_RL_WINDOW_MS || 60000),
  perIp: Number(process.env.AI_RL_PER_IP || 10),
  global: Number(process.env.AI_RL_GLOBAL || 60),
};
const ipHits = new Map();
let globalHits = [];
function rateLimited(ip) {
  const now = Date.now();
  globalHits = globalHits.filter((t) => now - t < RL.windowMs);
  const arr = (ipHits.get(ip) || []).filter((t) => now - t < RL.windowMs);
  if (globalHits.length >= RL.global || arr.length >= RL.perIp) {
    ipHits.set(ip, arr);
    return true;
  }
  arr.push(now);
  ipHits.set(ip, arr);
  globalHits.push(now);
  return false;
}
// Sweep stale rate-limit entries each window so ipHits can't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [ip, arr] of ipHits) {
    const live = arr.filter((t) => now - t < RL.windowMs);
    if (live.length) ipHits.set(ip, live);
    else ipHits.delete(ip);
  }
}, RL.windowMs).unref();

const EXPLAIN_SYSTEM = `You are Kasya, a friendly running and walking form coach.
You receive de-identified gait metrics from a phone/webcam scan and write a short, warm, plain-English summary.

Rules:
- 2 to 4 sentences. Encouraging, specific, easy to read.
- WELLNESS ONLY. Never give medical advice, diagnosis, or injury claims. Avoid words like "abnormal", "pronation", "injury", "correct".
- Everything is an ESTIMATE. Cadence (steps per minute) is the most reliable signal: lead with it and give ONE optional, actionable tip.
- If confidence or capture quality is low, gently suggest recording again (whole body in frame, good lighting, walk side-on) instead of over-interpreting.
- Use only the numbers provided. Do not invent metrics.`;

const COACH_SYSTEM = `You are Kasya's running/walking form COACH — think of yourself as the person's running buddy who happens to be great with gait numbers. You are chatting about ONE gait scan, with their de-identified metrics as context.

TONE — sound like a real person, not a report:
- Chat like you're texting a friend after their run: warm, casual, encouraging. Contractions are good. React to what they said first, then bring in the numbers naturally.
- Keep replies short (1-4 sentences). No bullet lists unless they ask for steps. Never lecture.
- NEVER use em dashes or en dashes. People don't text with them. Use a comma, or just start a new short sentence.
- It's fine to be playful ("Uy, solid yan!" / "Nice, that's a good sign!") but never sarcastic, and don't overdo exclamation points. One per reply max.

LANGUAGE:
- A system note tells you the requested language style. "taglish" = natural everyday Taglish — conversational Tagalog mixed with English running terms, the way runners in Metro Manila actually talk (e.g. "Ang ganda ng cadence mo, around 166 steps/min — steady na steady yung rhythm mo."). "english" = plain, friendly English.
- If the person writes in a different language than the setting, mirror THEIR language instead.

RULES — non-negotiable, regardless of tone or language:
- Answer their messages using ONLY the given metrics.
- WELLNESS ONLY. No medical, injury, or diagnosis language. Never use "pronation", "abnormal", "correct", "injury", "disease" (or their Tagalog equivalents). Everything is an ESTIMATE — use "about"/"roughly"/"mga"/"around".
- STAY ON TOPIC: only their gait metrics and simple form cues/drills that follow from them. If asked about anything else — nutrition, specific shoe brands or products, medical questions, other people, training calendars, or general chit-chat — gently say you can only help with this gait scan.
- Cadence (steps/min) is the most reliable signal. If capture quality is low, suggest a cleaner re-scan rather than over-reading the numbers.
- Do NOT invent metrics that aren't in the data. If a number they ask about isn't present, say it wasn't captured this scan.`;

const SHOES_SYSTEM = `You are Kasya's shoe finder. You match a person to real running/walking shoes using their de-identified gait scan numbers, their goal, and optional fit preferences (shoe size, foot width, budget).

- Choose 4 to 6 shoes ONLY from the catalog array you are given, referring to each by its exact "id". NEVER invent a shoe, a brand, or an id that isn't in the list.
- COMFORT-LED and gait-informed. You may use cadence (steps/min) and how much they bounce (vertical oscillation %) as soft comfort signals, plus their goal, budget and width preference. More bounce tends to feel smoother with more cushioning; a controlled bounce frees up a lighter, more responsive pair.
- WELLNESS ONLY. Do NOT mention or imply pronation, overpronation, supination, arch type, flat feet, injury, orthotics, "medical", or that a shoe "corrects" anything. Everything is an ESTIMATE — hedge with "about"/"may"/"try them on".
- Offer variety across the shortlist and respect the budget if one is given (the catalog spans premium to budget/local brands — don't only pick expensive ones).
- Each "reason" is ONE short, warm, plain sentence on why it may suit them and their goal, ending with a gentle nudge to try them on.
- Respond with ONLY a JSON object, no prose and no markdown fences: {"picks":[{"id":"<catalog id>","reason":"<one sentence>"}]}.`;

function send(res, status, obj) {
  if (res.writableEnded) return;
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type, x-proxy-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  });
  res.end(JSON.stringify(obj));
}

async function callOpenRouter(messages, maxTokens) {
  let r;
  try {
    r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${KEY}`,
        'HTTP-Referer': 'http://localhost',
        'X-Title': 'Kasya',
      },
      // Abort a hung upstream so clients get an error and can fall back.
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      // reasoning:low keeps gpt-5-class models from spending the whole budget on
      // hidden reasoning and returning empty content; max_tokens covers both.
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.6,
        max_tokens: maxTokens,
        reasoning: { effort: 'low' },
        messages,
      }),
    });
  } catch (e) {
    // Timed out or unreachable — report as a gateway timeout.
    return { ok: false, status: 504, detail: String(e?.name || e) };
  }
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 400);
    return { ok: false, status: r.status, detail };
  }
  const data = await r.json();
  const text = data?.choices?.[0]?.message?.content?.trim() || '';
  return { ok: true, text };
}

/**
 * Hard guarantee for the coach's texting voice: models still sneak em/en
 * dashes in despite the prompt. Number ranges keep a plain hyphen (30-60s);
 * every other dash connector becomes a comma.
 */
function stripDashes(text) {
  return text
    .replace(/(\d)\s*[—–]\s*(?=\d)/g, '$1-')
    .replace(/\s*[—–]+\s*/g, ', ')
    .replace(/([,.!?])\s*,\s*/g, '$1 ');
}

/** Keep only valid, recent chat turns so the payload stays small and safe. */
function sanitizeHistory(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, 800) }))
    .slice(-12);
}

const server = createServer((req, res) => {
  // The app deliberately aborts in-flight requests — a client going away
  // mid-upload must never surface as an unhandled ECONNRESET.
  req.on('error', () => {});
  res.on('error', () => {});

  if (req.method === 'OPTIONS') return send(res, 204, {});

  const route = req.url?.startsWith('/api/coach')
    ? 'coach'
    : req.url?.startsWith('/api/shoes')
      ? 'shoes'
      : req.url?.startsWith('/api/explain')
        ? 'explain'
        : null;
  if (req.method !== 'POST' || !route) return send(res, 404, { error: 'Not found' });
  if (AUTH_TOKEN && req.headers['x-proxy-token'] !== AUTH_TOKEN) {
    return send(res, 401, { error: 'Missing or invalid x-proxy-token.' });
  }
  if (!KEY) return send(res, 500, { error: 'OPENROUTER_API_KEY is not set. Add it to .env and restart.' });

  // Rate-limit key: the socket address, unless we're told a proxy in front of
  // us sets X-Forwarded-For — clients must not get to pick their own IP.
  const ip = (
    (TRUST_PROXY && req.headers['x-forwarded-for']) || req.socket.remoteAddress || 'local'
  ).toString().split(',')[0].trim();
  if (rateLimited(ip)) {
    return send(res, 429, { error: 'Rate limit reached — try again in a minute.' });
  }

  let body = '';
  let received = 0;
  let tooLarge = false;
  req.on('data', (c) => {
    received += c.length;
    if (received > MAX_BODY_BYTES) {
      if (!tooLarge) {
        tooLarge = true;
        send(res, 413, { error: 'Request body too large.' });
        req.destroy();
      }
      return;
    }
    body += c;
  });
  req.on('end', async () => {
    if (tooLarge) return;
    try {
      const payload = JSON.parse(body || '{}');
      let messages;
      let maxTokens;
      if (route === 'coach') {
        // Chat mode: system + scan context + language style + the conversation so far.
        const features = payload.features || {};
        // History is truncated below; features are forwarded verbatim, so cap
        // them too — real gait features are a small numeric object.
        if (JSON.stringify(features).length > MAX_FEATURES_BYTES) {
          return send(res, 400, { error: 'Features payload too large.' });
        }
        const history = sanitizeHistory(payload.messages);
        const lang = payload.lang === 'english' ? 'english' : 'taglish';
        messages = [
          { role: 'system', content: COACH_SYSTEM },
          {
            role: 'system',
            content:
              "The person's de-identified gait metrics for this scan (JSON). Use ONLY these:\n" +
              JSON.stringify(features),
          },
          { role: 'system', content: `Language style requested by the app: ${lang}.` },
          ...history,
        ];
        maxTokens = 700;
      } else if (route === 'shoes') {
        // Shoe finder: pick 4-6 ids from the provided catalog, grounded in the scan.
        const features = payload.features || {};
        const goal = payload.goal || features.goal || 'running';
        const profile = payload.profile && typeof payload.profile === 'object' ? payload.profile : {};
        const shoes = Array.isArray(payload.shoes) ? payload.shoes.slice(0, 60) : [];
        messages = [
          { role: 'system', content: SHOES_SYSTEM },
          {
            role: 'system',
            content: "The person's de-identified gait scan metrics (JSON). Use ONLY these:\n" + JSON.stringify(features),
          },
          { role: 'system', content: 'Their optional fit preferences (JSON):\n' + JSON.stringify(profile) },
          {
            role: 'user',
            content:
              `Goal: ${goal}. Pick the 4-6 best shoes for this person from ONLY the catalog below and return the JSON object described. ` +
              `Catalog (JSON array of {id,brand,model,category,cushion,tier,priceMin,priceMax,useCase}):\n` +
              JSON.stringify(shoes),
          },
        ];
        maxTokens = 900;
      } else {
        // Explain: one-shot summary of the features. Same cap as the coach
        // route — the whole payload is forwarded into the prompt.
        if (JSON.stringify(payload).length > MAX_FEATURES_BYTES) {
          return send(res, 400, { error: 'Features payload too large.' });
        }
        messages = [
          { role: 'system', content: EXPLAIN_SYSTEM },
          { role: 'user', content: 'Gait scan metrics (JSON):\n' + JSON.stringify(payload) },
        ];
        maxTokens = 500;
      }
      const out = await callOpenRouter(messages, maxTokens);
      if (!out.ok) {
        // Log the upstream detail server-side only; never relay provider bodies to the caller.
        console.error(`OpenRouter ${out.status}: ${out.detail}`);
        if (out.status === 504) {
          return send(res, 504, { error: 'AI upstream timed out — try again in a moment.' });
        }
        return send(res, 502, { error: 'AI service is unavailable right now. Please try again.' });
      }
      return send(res, 200, { text: route === 'coach' ? stripDashes(out.text) : out.text, model: MODEL });
    } catch (e) {
      return send(res, 500, { error: String(e?.message || e) });
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Kasya AI proxy on http://${HOST}:${PORT}  (model: ${MODEL}, rate: ${RL.perIp}/ip/min)`);
  if (!KEY) console.log('⚠  OPENROUTER_API_KEY not set — add it to .env, then restart.');
});
