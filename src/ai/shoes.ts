import { GaitReportRecord } from '../storage/reportRecord';
import { buildCoachFeatures } from './features';
import { Shoe } from '../data/shoes';
import { ShoeMatch, MatchOptions, matchOptionsFor } from '../shoes/match';
import { FitProfile } from '../storage/fitProfile';
import { sanitizeShoePicks } from './shoeRank';
import { AI_REQUEST_TIMEOUT_MS, proxyHeaders, resolveProxyUrls, withRequestTimeout } from './explain';

// The shoes endpoint sits next to explain/coach behind the same proxy.
// NOTE: the literal `process.env.EXPO_PUBLIC_...` dot expression is required
// here too — Expo inlines it at build time and skips any dynamic lookup.
const SHOES_URL = resolveProxyUrls(process.env.EXPO_PUBLIC_AI_PROXY_URL).shoesUrl;

/** Facts + id only — the exact candidate list the model may choose from. */
function candidate(s: Shoe) {
  return {
    id: s.id,
    brand: s.brand,
    model: s.model,
    category: s.category,
    cushion: s.cushion,
    tier: s.tier,
    priceMin: s.priceMin,
    priceMax: s.priceMax,
    useCase: s.useCase,
  };
}

/**
 * AI-matched shoe picks, grounded in the scan + optional fit profile. Sends only
 * de-identified numbers and the catalog facts; the response is sanitized (safe
 * reasons, real ids only). ALWAYS resolves — on any error / offline / no key it
 * returns the deterministic ranking, so the shoe screen never breaks.
 */
export async function recommendShoes(
  report: GaitReportRecord,
  catalog: Shoe[],
  profile: FitProfile = {},
  signal?: AbortSignal,
): Promise<ShoeMatch[]> {
  const opts: MatchOptions = matchOptionsFor(report, profile);
  // Only the structured preferences reach the third-party LLM — never the free-text
  // size field (keeps the payload strictly de-identified; size isn't used for ranking).
  const llmProfile = { width: profile.width, budgetMaxPhp: profile.budgetMaxPhp };
  try {
    const features = buildCoachFeatures(report);
    const res = await fetch(SHOES_URL, {
      method: 'POST',
      headers: proxyHeaders(),
      body: JSON.stringify({ features, goal: report.scanType, profile: llmProfile, shoes: catalog.map(candidate) }),
      signal: withRequestTimeout(signal, AI_REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`AI shoes responded ${res.status}`);
    const data = await res.json();
    return sanitizeShoePicks(data?.text, catalog, opts);
  } catch {
    return sanitizeShoePicks(null, catalog, opts);
  }
}
