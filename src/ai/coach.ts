import { GaitReportRecord } from '../storage/reportRecord';
import { buildCoachFeatures } from './features';
import { AI_REQUEST_TIMEOUT_MS, proxyHeaders, resolveProxyUrls, withRequestTimeout } from './explain';

// Coach endpoint sits next to the explain endpoint behind the same proxy.
// NOTE: the literal `process.env.EXPO_PUBLIC_...` dot expression is required
// here too — Expo inlines it at build time and skips any dynamic lookup.
const COACH_URL = resolveProxyUrls(process.env.EXPO_PUBLIC_AI_PROXY_URL).coachUrl;

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
  signal?: AbortSignal,
): Promise<string> {
  const features = buildCoachFeatures(report);
  const res = await fetch(COACH_URL, {
    method: 'POST',
    headers: proxyHeaders(),
    body: JSON.stringify({ features, messages: history }),
    signal: withRequestTimeout(signal, AI_REQUEST_TIMEOUT_MS),
  });
  if (res.status === 429) throw new CoachRateLimited();
  if (!res.ok) throw new Error(`AI coach responded ${res.status}`);
  const data = await res.json();
  const text = data?.text as string | undefined;
  if (!text || !text.trim()) throw new Error('Empty coach response');
  return text.trim();
}
