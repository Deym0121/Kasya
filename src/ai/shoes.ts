import { GaitReportRecord } from '../storage/reportRecord';
import { buildCoachFeatures } from './features';
import { Shoe } from '../data/shoes';
import { ShoeMatch, MatchGait, MatchOptions } from '../shoes/match';
import { FitProfile } from '../storage/fitProfile';
import { sanitizeShoePicks } from './shoeRank';

// The shoes endpoint sits next to explain/coach behind the same proxy.
const EXPLAIN_URL =
  ((globalThis as any)?.process?.env?.EXPO_PUBLIC_AI_PROXY_URL as string | undefined) ||
  'http://localhost:8787/api/explain';
const SHOES_URL = EXPLAIN_URL.replace(/\/api\/[^/]+$/, '/api/shoes');

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
  const gait: MatchGait = {
    cadenceSpm: report.result.cadence.value,
    bouncePct: report.metrics?.verticalOscillationPct,
  };
  const opts: MatchOptions = { useCase: report.scanType, gait, budgetMaxPhp: profile.budgetMaxPhp };
  // Only the structured preferences reach the third-party LLM — never the free-text
  // size field (keeps the payload strictly de-identified; size isn't used for ranking).
  const llmProfile = { width: profile.width, budgetMaxPhp: profile.budgetMaxPhp };
  try {
    const features = buildCoachFeatures(report);
    const res = await fetch(SHOES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features, goal: report.scanType, profile: llmProfile, shoes: catalog.map(candidate) }),
      signal,
    });
    if (!res.ok) throw new Error(`AI shoes responded ${res.status}`);
    const data = await res.json();
    return sanitizeShoePicks(data?.text, catalog, opts);
  } catch {
    return sanitizeShoePicks(null, catalog, opts);
  }
}
