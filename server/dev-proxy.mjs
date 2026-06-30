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
const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
const PORT = Number(process.env.AI_PROXY_PORT || 8787);

const SYSTEM = `You are StrideFit, a friendly running and walking form coach.
You receive de-identified gait metrics from a phone/webcam scan and write a short, warm, plain-English summary.

Rules:
- 2 to 4 sentences. Encouraging, specific, easy to read.
- WELLNESS ONLY. Never give medical advice, diagnosis, or injury claims. Avoid words like "abnormal", "pronation", "injury", "correct".
- Everything is an ESTIMATE. Cadence (steps per minute) is the most reliable signal: lead with it and give ONE optional, actionable tip.
- If confidence or capture quality is low, gently suggest recording again (whole body in frame, good lighting, walk side-on) instead of over-interpreting.
- Use only the numbers provided. Do not invent metrics.`;

function send(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  });
  res.end(JSON.stringify(obj));
}

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method !== 'POST' || !req.url.startsWith('/api/explain')) {
    return send(res, 404, { error: 'Not found' });
  }
  if (!KEY) {
    return send(res, 500, { error: 'OPENROUTER_API_KEY is not set. Add it to .env and restart.' });
  }

  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', async () => {
    try {
      const features = JSON.parse(body || '{}');
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${KEY}`,
          'HTTP-Referer': 'http://localhost',
          'X-Title': 'StrideFit',
        },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.6,
          max_tokens: 220,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: 'Gait scan metrics (JSON):\n' + JSON.stringify(features) },
          ],
        }),
      });
      if (!r.ok) {
        const detail = (await r.text()).slice(0, 400);
        return send(res, 502, { error: `OpenRouter ${r.status}`, detail });
      }
      const data = await r.json();
      const text = data?.choices?.[0]?.message?.content?.trim() || '';
      return send(res, 200, { text, model: MODEL });
    } catch (e) {
      return send(res, 500, { error: String(e?.message || e) });
    }
  });
});

server.listen(PORT, () => {
  console.log(`StrideFit AI proxy listening on http://localhost:${PORT}  (model: ${MODEL})`);
  if (!KEY) console.log('⚠  OPENROUTER_API_KEY not set — add it to .env, then restart.');
});
