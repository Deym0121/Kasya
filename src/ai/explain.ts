import { GaitReportRecord } from '../storage/reportRecord';
import { buildGaitFeatures } from './features';

// Where the app sends gait features for an AI explanation. Points at the local
// dev proxy by default; set EXPO_PUBLIC_AI_PROXY_URL to a deployed Edge Function
// for production. The OpenRouter key lives ONLY behind this URL, never here.
// NOTE: Expo only inlines the literal `process.env.EXPO_PUBLIC_...` dot
// expression at build time — any dynamic lookup stays undefined on device.
const CONFIGURED_PROXY_URL = process.env.EXPO_PUBLIC_AI_PROXY_URL;
// Optional shared secret matching the proxy's PROXY_AUTH_TOKEN. Unset in local
// dev (the proxy defaults to open); required only when the proxy enforces it.
const CONFIGURED_PROXY_TOKEN = process.env.EXPO_PUBLIC_AI_PROXY_TOKEN;

/** Request headers for the AI proxy — includes the auth token when configured. */
export function proxyHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (CONFIGURED_PROXY_TOKEN) headers['x-proxy-token'] = CONFIGURED_PROXY_TOKEN;
  return headers;
}

/**
 * Derive both proxy endpoints from the one configured value. Accepts a bare
 * origin/base (with or without trailing slashes) or a full /api/explain or
 * /api/coach URL, so a slightly-off .env can never route chat to the wrong
 * endpoint.
 */
export function resolveProxyUrls(configured: string | undefined): {
  explainUrl: string;
  coachUrl: string;
} {
  const raw = (configured || 'http://localhost:8787').trim().replace(/\/+$/, '');
  const base = raw.replace(/\/api\/(explain|coach)$/, '');
  return { explainUrl: `${base}/api/explain`, coachUrl: `${base}/api/coach` };
}

// How long we wait on the proxy before giving up, so a hung upstream rejects
// and the built-in rule-based fallback fires instead of spinning forever.
export const AI_REQUEST_TIMEOUT_MS = 20000;

/**
 * Combine the caller's abort signal with a hard timeout. Uses the native
 * AbortSignal.timeout/any helpers when the runtime has them; otherwise falls
 * back to a plain AbortController + setTimeout (Hermes doesn't ship the
 * static helpers).
 */
export function withRequestTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function' && typeof AbortSignal.any === 'function') {
    const timeoutSignal = AbortSignal.timeout(ms);
    return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const abortNow = () => {
    clearTimeout(timer);
    controller.abort();
  };
  if (signal) {
    if (signal.aborted) abortNow();
    else signal.addEventListener('abort', abortNow, { once: true });
  }
  return controller.signal;
}

const PROXY_URL = resolveProxyUrls(CONFIGURED_PROXY_URL).explainUrl;

/**
 * Ask the AI coach for a friendly, hedged summary of a gait scan.
 * Sends only de-identified numeric features. Throws on any failure so callers
 * can fall back to the built-in rule-based tip — the app must work without AI.
 */
export async function explainGait(report: GaitReportRecord, signal?: AbortSignal): Promise<string> {
  const features = buildGaitFeatures(report);
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: proxyHeaders(),
    body: JSON.stringify(features),
    signal: withRequestTimeout(signal, AI_REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`AI proxy responded ${res.status}`);
  const data = await res.json();
  const text = data?.text as string | undefined;
  if (!text || !text.trim()) throw new Error('Empty AI response');
  return text.trim();
}
