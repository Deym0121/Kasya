import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { internal, api } from './_generated/api';
import { auth } from './auth';
import { getAuthUserId } from '@convex-dev/auth/server';

/**
 * Kasya's HTTP surface on Convex:
 *  - Convex Auth routes (sign-in/out token endpoints)
 *  - POST /revenuecat   — RevenueCat webhook → server-truth entitlements
 *  - POST /api/coach    — scan-grounded AI coach chat (Taglish/English)
 *  - POST /api/shoes    — AI shoe picks from the provided catalog
 *  - POST /api/explain  — one-shot scan summary
 *
 * The AI routes are a straight port of server/dev-proxy.mjs (kept for local
 * dev). The OpenRouter key lives ONLY in Convex env vars. Signed-in callers
 * get a server-enforced 50/day coach quota and, once the RevenueCat webhook
 * has linked them, a server-truth entitlement check. Anonymous callers are
 * still allowed for now (guest/demo mode) — tighten to require auth +
 * entitlement before public launch.
 */

const MODEL = () => process.env.OPENROUTER_MODEL || 'openai/gpt-5-mini';

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

/**
 * Hard guarantee for the coach's texting voice: models still sneak em/en
 * dashes in despite the prompt. Number ranges keep a plain hyphen (30-60s);
 * every other dash connector becomes a comma.
 */
function stripDashes(text: string): string {
  return text
    .replace(/(\d)\s*[—–]\s*(?=\d)/g, '$1-')
    .replace(/\s*[—–]+\s*/g, ', ')
    .replace(/([,.!?])\s*,\s*/g, '$1 ');
}

/** Keep only valid, recent chat turns so the payload stays small and safe. */
function sanitizeHistory(messages: unknown): { role: 'user' | 'assistant'; content: string }[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(
      (m): m is { role: 'user' | 'assistant'; content: string } =>
        !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string',
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, 800) }))
    .slice(-12);
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

const preflight = httpAction(async () => new Response(null, { status: 204, headers: CORS }));

async function callOpenRouter(
  messages: { role: string; content: string }[],
  maxTokens: number,
): Promise<{ ok: true; text: string } | { ok: false; status: number; detail: string }> {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://kasya.app',
      'X-Title': 'Kasya',
    },
    // reasoning:low keeps gpt-5-class models from spending the whole budget on
    // hidden reasoning and returning empty content; max_tokens covers both.
    body: JSON.stringify({
      model: MODEL(),
      temperature: 0.6,
      max_tokens: maxTokens,
      reasoning: { effort: 'low' },
      messages,
    }),
  });
  if (!r.ok) return { ok: false, status: r.status, detail: (await r.text()).slice(0, 400) };
  const data = await r.json();
  const text: string = data?.choices?.[0]?.message?.content?.trim() || '';
  return { ok: true, text };
}

const coach = httpAction(async (ctx, req) => {
  if (!process.env.OPENROUTER_API_KEY) return json(500, { error: 'AI is not configured.' });
  const payload = await req.json().catch(() => ({}));

  // Signed-in callers get the server-enforced daily quota and, once the
  // RevenueCat webhook has linked them, the server-truth entitlement gate.
  const userId = await getAuthUserId(ctx);
  if (userId) {
    const ent = await ctx.runQuery(api.entitlements.mine, {});
    if (ent.linked && !ent.active) {
      return json(403, { error: 'Premium required for the AI coach.' });
    }
    const usage = await ctx.runMutation(internal.ai.bumpUsage, { userId });
    if (!usage.allowed) return json(429, { error: 'Daily coach limit reached — resets tomorrow.' });
  }

  const features = payload.features || {};
  const history = sanitizeHistory(payload.messages);
  const lang = payload.lang === 'english' ? 'english' : 'taglish';
  const out = await callOpenRouter(
    [
      { role: 'system', content: COACH_SYSTEM },
      {
        role: 'system',
        content:
          "The person's de-identified gait metrics for this scan (JSON). Use ONLY these:\n" +
          JSON.stringify(features),
      },
      { role: 'system', content: `Language style requested by the app: ${lang}.` },
      ...history,
    ],
    700,
  );
  if (!out.ok) {
    console.error(`OpenRouter ${out.status}: ${out.detail}`);
    return json(502, { error: 'AI service is unavailable right now. Please try again.' });
  }
  return json(200, { text: stripDashes(out.text), model: MODEL() });
});

const shoes = httpAction(async (ctx, req) => {
  if (!process.env.OPENROUTER_API_KEY) return json(500, { error: 'AI is not configured.' });
  const payload = await req.json().catch(() => ({}));
  const features = payload.features || {};
  const goal = payload.goal || features.goal || 'running';
  const profile = payload.profile && typeof payload.profile === 'object' ? payload.profile : {};
  const catalog = Array.isArray(payload.shoes) ? payload.shoes.slice(0, 60) : [];
  const out = await callOpenRouter(
    [
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
          JSON.stringify(catalog),
      },
    ],
    900,
  );
  if (!out.ok) {
    console.error(`OpenRouter ${out.status}: ${out.detail}`);
    return json(502, { error: 'AI service is unavailable right now. Please try again.' });
  }
  return json(200, { text: out.text, model: MODEL() });
});

const explain = httpAction(async (_ctx, req) => {
  if (!process.env.OPENROUTER_API_KEY) return json(500, { error: 'AI is not configured.' });
  const payload = await req.json().catch(() => ({}));
  const out = await callOpenRouter(
    [
      { role: 'system', content: EXPLAIN_SYSTEM },
      { role: 'user', content: 'Gait scan metrics (JSON):\n' + JSON.stringify(payload) },
    ],
    500,
  );
  if (!out.ok) {
    console.error(`OpenRouter ${out.status}: ${out.detail}`);
    return json(502, { error: 'AI service is unavailable right now. Please try again.' });
  }
  return json(200, { text: out.text, model: MODEL() });
});

/**
 * RevenueCat webhook → entitlements. Configure the SAME token in both the
 * RevenueCat dashboard (webhook Authorization header) and Convex env
 * (RC_WEBHOOK_TOKEN). Events for any entitlement update the row keyed by
 * app_user_id; expiry does the deactivating at read time.
 */
const revenuecat = httpAction(async (ctx, req) => {
  const expected = process.env.RC_WEBHOOK_TOKEN;
  if (!expected) return json(500, { error: 'Webhook not configured.' });
  const got = req.headers.get('authorization') || '';
  if (got !== `Bearer ${expected}` && got !== expected) return json(401, { error: 'Unauthorized' });

  const body = await req.json().catch(() => null);
  const event = body?.event;
  if (!event?.app_user_id || !event?.type) return json(400, { error: 'Malformed event' });

  await ctx.runMutation(internal.entitlements.upsertFromWebhook, {
    rcAppUserId: String(event.app_user_id),
    productId: event.product_id ? String(event.product_id) : null,
    expiresAt: typeof event.expiration_at_ms === 'number' ? event.expiration_at_ms : null,
    environment: event.environment ? String(event.environment) : null,
    lastEventType: String(event.type),
  });
  return json(200, { ok: true });
});

const http = httpRouter();
auth.addHttpRoutes(http);
http.route({ path: '/api/coach', method: 'POST', handler: coach });
http.route({ path: '/api/coach', method: 'OPTIONS', handler: preflight });
http.route({ path: '/api/shoes', method: 'POST', handler: shoes });
http.route({ path: '/api/shoes', method: 'OPTIONS', handler: preflight });
http.route({ path: '/api/explain', method: 'POST', handler: explain });
http.route({ path: '/api/explain', method: 'OPTIONS', handler: preflight });
http.route({ path: '/revenuecat', method: 'POST', handler: revenuecat });

export default http;
