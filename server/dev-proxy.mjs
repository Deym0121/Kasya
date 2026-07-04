// StrideFit local AI proxy.
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

const EXPLAIN_SYSTEM = `You are StrideFit, a friendly running and walking form coach.
You receive de-identified gait metrics from a phone/webcam scan and write a short, warm, plain-English summary.

Rules:
- 2 to 4 sentences. Encouraging, specific, easy to read.
- WELLNESS ONLY. Never give medical advice, diagnosis, or injury claims. Avoid words like "abnormal", "pronation", "injury", "correct".
- Everything is an ESTIMATE. Cadence (steps per minute) is the most reliable signal: lead with it and give ONE optional, actionable tip.
- If confidence or capture quality is low, gently suggest recording again (whole body in frame, good lighting, walk side-on) instead of over-interpreting.
- Use only the numbers provided. Do not invent metrics.`;

const COACH_SYSTEM = `You are StrideFit's running/walking form COACH, chatting with the person about ONE gait scan. You are given their de-identified scan metrics as context.

- Answer their messages using ONLY these metrics. Keep replies short (1-4 sentences), warm and plain.
- WELLNESS ONLY. No medical, injury, or diagnosis language. Never use "pronation", "abnormal", "correct", "injury", "disease". Everything is an ESTIMATE — use "about"/"roughly".
- STAY ON TOPIC: only their gait metrics and simple form cues/drills that follow from them. If asked about anything else — nutrition, specific shoe brands or products, medical questions, other people, training calendars, or general chit-chat — gently say you can only help with this gait scan.
- Cadence (steps/min) is the most reliable signal. If capture quality is low, suggest a cleaner re-scan rather than over-reading the numbers.
- Do NOT invent metrics that aren't in the data. If a number they ask about isn't present, say it wasn't captured this scan.`;

function send(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  });
  res.end(JSON.stringify(obj));
}

async function callOpenRouter(messages, maxTokens) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KEY}`,
      'HTTP-Referer': 'http://localhost',
      'X-Title': 'StrideFit',
    },
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
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 400);
    return { ok: false, status: r.status, detail };
  }
  const data = await r.json();
  const text = data?.choices?.[0]?.message?.content?.trim() || '';
  return { ok: true, text };
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
  if (req.method === 'OPTIONS') return send(res, 204, {});

  const route =
    req.url?.startsWith('/api/coach') ? 'coach' : req.url?.startsWith('/api/explain') ? 'explain' : null;
  if (req.method !== 'POST' || !route) return send(res, 404, { error: 'Not found' });
  if (!KEY) return send(res, 500, { error: 'OPENROUTER_API_KEY is not set. Add it to .env and restart.' });

  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local').toString().split(',')[0].trim();
  if (rateLimited(ip)) {
    return send(res, 429, { error: 'Rate limit reached — try again in a minute.' });
  }

  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', async () => {
    try {
      const payload = JSON.parse(body || '{}');
      let messages;
      let maxTokens;
      if (route === 'coach') {
        // Chat mode: system + scan context + the conversation so far.
        const features = payload.features || {};
        const history = sanitizeHistory(payload.messages);
        messages = [
          { role: 'system', content: COACH_SYSTEM },
          {
            role: 'system',
            content:
              "The person's de-identified gait metrics for this scan (JSON). Use ONLY these:\n" +
              JSON.stringify(features),
          },
          ...history,
        ];
        maxTokens = 700;
      } else {
        // Explain: one-shot summary of the features.
        messages = [
          { role: 'system', content: EXPLAIN_SYSTEM },
          { role: 'user', content: 'Gait scan metrics (JSON):\n' + JSON.stringify(payload) },
        ];
        maxTokens = 500;
      }
      const out = await callOpenRouter(messages, maxTokens);
      if (!out.ok) return send(res, 502, { error: `OpenRouter ${out.status}`, detail: out.detail });
      return send(res, 200, { text: out.text, model: MODEL });
    } catch (e) {
      return send(res, 500, { error: String(e?.message || e) });
    }
  });
});

server.listen(PORT, () => {
  console.log(`StrideFit AI proxy on http://localhost:${PORT}  (model: ${MODEL}, rate: ${RL.perIp}/ip/min)`);
  if (!KEY) console.log('⚠  OPENROUTER_API_KEY not set — add it to .env, then restart.');
});
