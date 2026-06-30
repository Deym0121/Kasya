import { GaitReportRecord } from '../storage/reportRecord';
import { buildGaitFeatures } from './features';

// Where the app sends gait features for an AI explanation. Points at the local
// dev proxy by default; set EXPO_PUBLIC_AI_PROXY_URL to a deployed Edge Function
// for production. The OpenRouter key lives ONLY behind this URL, never here.
const PROXY_URL =
  ((globalThis as any)?.process?.env?.EXPO_PUBLIC_AI_PROXY_URL as string | undefined) ||
  'http://localhost:8787/api/explain';

/**
 * Ask the AI coach for a friendly, hedged summary of a gait scan.
 * Sends only de-identified numeric features. Throws on any failure so callers
 * can fall back to the built-in rule-based tip — the app must work without AI.
 */
export async function explainGait(report: GaitReportRecord, signal?: AbortSignal): Promise<string> {
  const features = buildGaitFeatures(report);
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(features),
    signal,
  });
  if (!res.ok) throw new Error(`AI proxy responded ${res.status}`);
  const data = await res.json();
  const text = data?.text as string | undefined;
  if (!text || !text.trim()) throw new Error('Empty AI response');
  return text.trim();
}
