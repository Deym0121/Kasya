import { GaitReportRecord } from '../storage/reportRecord';
import type { CoachLang } from '../storage/settings';
import { buildCoachFeatures } from './features';

// Coach endpoint sits next to the explain endpoint behind the same proxy.
const EXPLAIN_URL =
  ((globalThis as any)?.process?.env?.EXPO_PUBLIC_AI_PROXY_URL as string | undefined) ||
  'http://localhost:8787/api/explain';
const COACH_URL = EXPLAIN_URL.replace(/\/api\/[^/]+$/, '/api/coach');

export type ChatRole = 'user' | 'assistant';
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** Thrown when the proxy's rate limit is hit — the UI can show a gentle note. */
export class CoachRateLimited extends Error {
  constructor() {
    super('AI coach is busy (rate limited)');
    this.name = 'CoachRateLimited';
  }
}

/**
 * Chat with the AI coach about one scan. Sends only de-identified numbers plus
 * the conversation so far; returns the coach's next reply. Throws on any failure
 * so the UI can fall back gracefully — the app must work without AI.
 */
export async function coachChat(
  report: GaitReportRecord,
  history: ChatMessage[],
  lang: CoachLang = 'taglish',
  signal?: AbortSignal,
): Promise<string> {
  const features = buildCoachFeatures(report);
  const res = await fetch(COACH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ features, messages: history, lang }),
    signal,
  });
  if (res.status === 429) throw new CoachRateLimited();
  if (!res.ok) throw new Error(`AI coach responded ${res.status}`);
  const data = await res.json();
  const text = data?.text as string | undefined;
  if (!text || !text.trim()) throw new Error('Empty coach response');
  return text.trim();
}
