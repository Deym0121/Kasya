import { Shoe } from '../data/shoes';
import { matchShoes, ShoeMatch, MatchOptions } from '../shoes/match';

/**
 * Foot-type / medical language the AI must never use about a shoe. Mirrors the
 * app's locked honesty guardrail: comfort-led only, no pronation / arch / injury
 * / corrective claims. Any AI reason that trips this is dropped for the safe one.
 */
export const SHOE_BANNED =
  /\b(over[- ]?pronat\w*|pronat\w*|supinat\w*|abnormal|injur\w*|diagnos\w*|disease|medical|correct(s|ed|ion|ive)?|arch[- ]?type|flat[- ]?feet|orthotic\w*)\b/i;

interface RawPick {
  id: string;
  reason?: string;
}

/** Pull a picks array out of whatever the model returned (object, array, or JSON string). */
function extractPicks(raw: unknown): RawPick[] {
  let value: any = raw;
  if (typeof value === 'string') {
    // Strip a ```json ... ``` fence and grab the first {...} / [...] blob.
    const cleaned = value.replace(/```(?:json)?/gi, '').trim();
    const m = cleaned.match(/[[{][\s\S]*[\]}]/);
    try {
      value = JSON.parse(m ? m[0] : cleaned);
    } catch {
      return [];
    }
  }
  const arr = Array.isArray(value) ? value : Array.isArray(value?.picks) ? value.picks : null;
  if (!arr) return [];
  return arr
    .filter((p: any) => p && typeof p.id === 'string')
    .map((p: any) => ({ id: p.id, reason: typeof p.reason === 'string' ? p.reason : undefined }));
}

/**
 * Convert the AI's raw picks into a safe, ordered ShoeMatch[] for the UI.
 *
 * The deterministic `matchShoes` is always the backbone: it provides the % score
 * and a guaranteed-safe reason. The AI only gets to (a) reorder its shortlist to
 * the top and (b) supply nicer wording — and only if that wording is clean.
 *
 * - ids not in the catalog are ignored (the AI can't invent a shoe)
 * - a reason containing foot-type / medical language is swapped for the safe one
 * - if fewer than `minPicks` usable picks survive (or the input is junk), we return
 *   the full deterministic ranking instead. AI enhances; it never breaks the screen.
 */
export function sanitizeShoePicks(
  raw: unknown,
  catalog: Shoe[],
  opts: MatchOptions,
  minPicks = 3,
): ShoeMatch[] {
  const ranked = matchShoes(catalog, opts);
  const byId = new Map(ranked.map((m) => [m.shoe.id, m]));

  const seen = new Set<string>();
  const aiMatches: ShoeMatch[] = [];
  for (const p of extractPicks(raw)) {
    const base = byId.get(p.id);
    if (!base || seen.has(p.id)) continue;
    seen.add(p.id);
    const clean = p.reason && p.reason.trim() && !SHOE_BANNED.test(p.reason) ? p.reason.trim() : base.reason;
    aiMatches.push({ ...base, reason: clean, source: 'ai' });
  }

  if (aiMatches.length < minPicks) {
    return ranked.map((m) => ({ ...m, source: 'rules' }));
  }
  const rest = ranked.filter((m) => !seen.has(m.shoe.id)).map((m) => ({ ...m, source: 'rules' as const }));
  return [...aiMatches, ...rest];
}
