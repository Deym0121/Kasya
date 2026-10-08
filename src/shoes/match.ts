import { Shoe } from '../data/shoes';

export interface ShoeMatch {
  shoe: Shoe;
  /** 0–100 comfort-led match score */
  score: number;
  reason: string;
  /** who produced this match — the deterministic matcher, or the AI shortlist */
  source?: 'ai' | 'rules';
  /**
   * Set only when a budget is given and this shoe usually sells above it.
   * 'over' = ranked after every shoe that fits; 'closest' = nothing in the
   * catalog fits the budget, so this is one of the nearest-priced fallbacks.
   */
  overBudget?: 'over' | 'closest';
}

/** Comfort-led signals pulled from the scan — preferences, never a foot-type prescription. */
export interface MatchGait {
  cadenceSpm?: number;
  /** vertical oscillation % (how much you bounce) */
  bouncePct?: number;
}

export interface MatchOptions {
  /** the user's goal / use-case: running | walking | gym | daily_comfort | recovery */
  useCase: string;
  /** optional gait read from the latest scan */
  gait?: MatchGait;
  /** optional budget cap (PHP) — within-budget shoes rank up, over-budget down */
  budgetMaxPhp?: number;
}

/** Tone bucket for a match score — drives the score pill's tint in the UI. */
export function scoreTone(score: number): 'strong' | 'good' | 'fair' {
  return score >= 90 ? 'strong' : score >= 75 ? 'good' : 'fair';
}

function humanize(useCase: string): string {
  return useCase.replace(/_/g, ' ');
}

/** Categories that naturally suit each goal — a small, honest ranking nudge. */
const GOAL_CATEGORIES: Record<string, string[]> = {
  running: ['neutral', 'stability', 'max_cushion'],
  walking: ['walking', 'max_cushion', 'neutral'],
  gym: ['gym', 'neutral'],
  recovery: ['max_cushion', 'recovery', 'walking'],
  daily_comfort: ['walking', 'neutral', 'stability', 'max_cushion'],
};

/**
 * How the shoe's cushioning lines up with how you move. Comfort-led: more bounce
 * tends to feel smoother with more cushioning; a controlled bounce leaves you
 * free to enjoy a lighter, more responsive pair. Never a medical prescription.
 */
function cushionComfort(cushion: Shoe['cushion'], bouncePct?: number): { delta: number; note: string } {
  // 0 (or missing / non-finite) means the scan couldn't measure bounce — it is
  // "not measured", never "controlled", and must not drive advice.
  if (bouncePct == null || !Number.isFinite(bouncePct) || bouncePct <= 0) {
    return { delta: cushion === 'high' ? 4 : cushion === 'medium' ? 2 : 0, note: '' };
  }
  if (bouncePct >= 12) {
    return {
      delta: cushion === 'high' ? 9 : cushion === 'medium' ? 4 : -3,
      note: 'you bounce a fair bit, so more cushioning may feel smoother',
    };
  }
  // Controlled bounce: never pitch a lighter pair against a high-cushion shoe —
  // there the cushioning is simply a comfort call.
  if (cushion === 'high') {
    return {
      delta: 2,
      note: 'your bounce looks controlled, so this much cushioning is a comfort choice — see how it feels',
    };
  }
  return {
    delta: cushion === 'medium' ? 5 : 3,
    note: 'your bounce looks controlled, so a lighter, responsive pair suits you',
  };
}

/** How the shoe's price band sits against the user's stated budget cap. */
function budgetFit(shoe: Shoe, budgetMaxPhp?: number): { delta: number; note: string } {
  if (!budgetMaxPhp || budgetMaxPhp <= 0) return { delta: 0, note: '' };
  const b = `₱${budgetMaxPhp.toLocaleString()}`;
  if (shoe.priceMin > budgetMaxPhp) return { delta: -18, note: `Usually sells above your ${b} budget.` };
  if (shoe.priceMax <= budgetMaxPhp) return { delta: 6, note: `Usually fits your ${b} budget.` };
  return { delta: 2, note: `Right around your ${b} budget cap.` };
}

/**
 * How the shoe lines up with your stride rhythm. Comfort-led and deliberately
 * smaller than the bounce nudge, so it only reorders near-ties: a very quick
 * cadence tends to pair well with a lighter, lower-stack shoe, while a notably
 * relaxed cadence often feels smoother with more cushioning underfoot. The note
 * is only attached where it supports the shoe — never argued against it.
 */
function cadenceComfort(cushion: Shoe['cushion'], cadenceSpm?: number): { delta: number; note: string } {
  // A cadence of 0 means the scan couldn't measure one — never base advice on it.
  if (cadenceSpm == null || cadenceSpm <= 0) return { delta: 0, note: '' };
  if (cadenceSpm >= 170) {
    if (cushion === 'high') return { delta: 0, note: '' };
    return {
      delta: cushion === 'low' ? 2 : 1,
      note: 'Your cadence looks quick, so a lighter, lower-stack shoe may feel natural',
    };
  }
  if (cadenceSpm <= 140) {
    if (cushion === 'low') return { delta: 0, note: '' };
    return {
      delta: cushion === 'high' ? 2 : 1,
      note: 'Your cadence is on the relaxed side, so extra cushioning may feel smoother',
    };
  }
  return { delta: 0, note: '' };
}

/** Public-review reputation as a tie-break rank (no review signal = 0). */
const QUALITY_RANK: Record<NonNullable<Shoe['quality']>['tone'], number> = {
  well_regarded: 3,
  solid: 2,
  mixed: 1,
};
const qualityRank = (s: Shoe) => (s.quality ? QUALITY_RANK[s.quality.tone] : 0);

/**
 * Neutral, deterministic ordering for equal scores: our own product never
 * floats above a rival (FTC); then better public-review reputation; then the
 * cheaper pair; then id — never the catalog's listing order (which happens to
 * list premium brands first).
 */
function compareTies(a: ShoeMatch, b: ShoeMatch): number {
  return (
    (a.shoe.isOwnProduct ? 1 : 0) - (b.shoe.isOwnProduct ? 1 : 0) ||
    qualityRank(b.shoe) - qualityRank(a.shoe) ||
    a.shoe.priceMin - b.shoe.priceMin ||
    (a.shoe.id < b.shoe.id ? -1 : a.shoe.id > b.shoe.id ? 1 : 0)
  );
}

/**
 * Comfort-led, gait-informed matching (re-plan): rank the WHOLE catalog by how
 * well each shoe fits the user's goal AND the way they actually move (soft
 * signals from the scan) — NOT by an inferred foot type / pronation. Copy always
 * nudges the user to try shoes on and pick what feels most comfortable. Own
 * products are flagged (FTC) and never ranked above an equally-scored rival.
 *
 * A budget is a cap, not a nudge: every shoe that can be had within it ranks
 * ahead of every shoe that usually sells above it. Only when NOTHING fits do
 * over-budget shoes lead — nearest price first, each labelled as the closest
 * over budget.
 */
export function matchShoes(shoes: Shoe[], opts: MatchOptions): ShoeMatch[] {
  const goal = opts.useCase;
  const bounce = opts.gait?.bouncePct;
  const suited = GOAL_CATEGORIES[goal] ?? [];
  const budgetMax = opts.budgetMaxPhp && opts.budgetMaxPhp > 0 ? opts.budgetMaxPhp : undefined;

  const scored: ShoeMatch[] = shoes.map((shoe) => {
    const fits = shoe.useCase.includes(goal);
    const cushion = cushionComfort(shoe.cushion, bounce);
    const cadence = cadenceComfort(shoe.cushion, opts.gait?.cadenceSpm);
    const budget = budgetFit(shoe, budgetMax);
    let score = 55;
    if (fits) score += 25;
    if (suited.includes(shoe.category)) score += 5;
    score += cushion.delta + cadence.delta + budget.delta;
    score = Math.max(0, Math.min(100, score));

    let reason: string;
    if (fits) {
      reason = `Good for ${humanize(goal)} with ${shoe.cushion} cushioning`;
      reason += cushion.note ? ` — ${cushion.note}.` : '.';
      if (cadence.note) reason += ` ${cadence.note}.`;
      if (budget.note) reason += ` ${budget.note}`;
      reason += ' Try a pair on and see how they feel.';
    } else {
      reason = `A comfortable all-rounder — not specialized for ${humanize(goal)}, but comfort is what matters most.`;
      if (budget.note) reason += ` ${budget.note}`;
    }

    const m: ShoeMatch = { shoe, score, reason };
    if (budgetMax != null && shoe.priceMin > budgetMax) m.overBudget = 'over';
    return m;
  });

  const byScore = (a: ShoeMatch, b: ShoeMatch) => b.score - a.score || compareTies(a, b);
  if (budgetMax == null) return scored.sort(byScore);

  // Over-budget pairs always trail, nearest price first (then best match).
  const within = scored.filter((m) => !m.overBudget).sort(byScore);
  const over = scored
    .filter((m) => m.overBudget)
    .sort((x, y) => x.shoe.priceMin - y.shoe.priceMin || byScore(x, y));
  if (within.length) return [...within, ...over];

  // Nothing fits: the nearest-priced pairs lead, explicitly labelled.
  const b = `₱${budgetMax.toLocaleString()}`;
  return over.map((m) => ({
    ...m,
    overBudget: 'closest' as const,
    reason: `Closest over your ${b} budget — nothing we list usually sells within it. ${m.reason.replace(
      ` Usually sells above your ${b} budget.`,
      '',
    )}`,
  }));
}

/** The saved-scan fields the matcher reads (structurally a GaitReportRecord). */
export interface MatchableReport {
  scanType: string;
  result: { cadence: { value: number; confidence: string } };
  metrics?: { verticalOscillationPct?: number };
}

/**
 * The one way every surface (Home top-3, Shoe matches, PDF report, AI picks)
 * turns a saved scan + the optional fit profile into matcher inputs, so they
 * can't rank differently. Gait signals are only passed when they were actually
 * measured: a 0 means "not measured", and a low-confidence scan isn't
 * trustworthy enough to steer picks.
 */
export function matchOptionsFor(report: MatchableReport, profile?: { budgetMaxPhp?: number } | null): MatchOptions {
  const trusted = report.result.cadence.confidence !== 'low';
  const cadence = report.result.cadence.value;
  const bounce = report.metrics?.verticalOscillationPct;
  const gait: MatchGait = {};
  if (trusted && Number.isFinite(cadence) && cadence > 0) gait.cadenceSpm = cadence;
  if (trusted && bounce != null && Number.isFinite(bounce) && bounce > 0) gait.bouncePct = bounce;
  const opts: MatchOptions = { useCase: report.scanType, gait };
  if (profile?.budgetMaxPhp && profile.budgetMaxPhp > 0) opts.budgetMaxPhp = profile.budgetMaxPhp;
  return opts;
}
