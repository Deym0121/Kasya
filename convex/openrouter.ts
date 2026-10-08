/**
 * Shared OpenRouter chat call for the HTTP AI routes (http.ts) and the race
 * submission verifier (raceSubmissions.ts). The key lives ONLY in Convex env
 * (OPENROUTER_API_KEY). No Convex functions are registered in this module.
 */

export const MODEL = () => process.env.OPENROUTER_MODEL || 'openai/gpt-5-mini';

export async function callOpenRouter(
  messages: { role: string; content: string }[],
  maxTokens: number,
  temperature = 0.6,
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
      temperature,
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
