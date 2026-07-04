/**
 * Progress-over-time derivations for the History tab. Pure TS (no RN imports),
 * unit-tested in node. Inputs use narrow structural types so this module never
 * imports from storage (GaitReportRecord is structurally assignable).
 */

export interface TrendPoint {
  /** ISO timestamp of the scan */
  t: string;
  value: number;
}

export interface TrendReportLike {
  createdAt: string;
  result: {
    cadence: { value: number; confidence: string };
    captureQuality: { ok: boolean };
  };
  steps?: { symmetryPct: number; stanceRatioPct: number };
  metrics?: { symmetryPct: number };
}

export interface Trends {
  cadence: TrendPoint[];
  symmetry: TrendPoint[];
  stance: TrendPoint[];
}

/** A scan whose cadence we trust enough to chart / compare. */
function usable(r: TrendReportLike): boolean {
  return r.result.captureQuality.ok && r.result.cadence.confidence !== 'low' && r.result.cadence.value > 0;
}

const byDate = (a: TrendReportLike, b: TrendReportLike) =>
  new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

/**
 * Time series (oldest → newest) for the trend chart. Input may be in any order
 * (listReports returns newest-first). Untrusted scans are skipped rather than
 * charted as misleading points.
 */
export function buildTrends(reports: TrendReportLike[]): Trends {
  const sorted = [...reports].sort(byDate);
  const cadence: TrendPoint[] = [];
  const symmetry: TrendPoint[] = [];
  const stance: TrendPoint[] = [];
  for (const r of sorted) {
    if (usable(r)) cadence.push({ t: r.createdAt, value: Math.round(r.result.cadence.value) });
    const sym = r.steps?.symmetryPct ?? r.metrics?.symmetryPct ?? 0;
    if (sym > 0) symmetry.push({ t: r.createdAt, value: Math.round(sym) });
    const st = r.steps?.stanceRatioPct ?? 0;
    if (st > 0) stance.push({ t: r.createdAt, value: Math.round(st) });
  }
  return { cadence, symmetry, stance };
}

export interface CadenceDelta {
  deltaSpm: number;
  direction: 'up' | 'down' | 'steady';
}

/** Latest usable cadence vs the one before it. Null until there are two to compare. */
export function cadenceDelta(reports: TrendReportLike[]): CadenceDelta | null {
  const pts = buildTrends(reports).cadence;
  if (pts.length < 2) return null;
  const delta = pts[pts.length - 1].value - pts[pts.length - 2].value;
  const direction = Math.abs(delta) < 3 ? 'steady' : delta > 0 ? 'up' : 'down';
  return { deltaSpm: delta, direction };
}

/** Hedged one-liner for the delta callout. */
export function deltaCopy(d: CadenceDelta): string {
  const n = Math.abs(d.deltaSpm);
  if (d.direction === 'steady') {
    return `Your cadence is holding steady vs your last scan (about ${n} spm difference).`;
  }
  return `Your cadence is ${d.direction} about ${n} spm vs your last scan — an estimate, not a target.`;
}
