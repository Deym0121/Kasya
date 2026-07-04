/**
 * The rotating "Today's focus" coach tip. Pure TS, deterministic (no Date.now /
 * randomness inside — callers pass a day key), unit-tested in node. Tips come
 * from the latest report's own tested feedback when available, topped up with a
 * generic wellness pool. No AI calls — the optional OpenRouter path is separate.
 */

export interface CoachSource {
  cadenceTip?: string;
  feedback?: { recommendations: string[] };
}

/** Generic wellness-only tips (each must pass the banned-language tests). */
export const GENERIC_TIPS: string[] = [
  'Light, quick steps often feel smoother — try a 30-second cadence count on your next walk.',
  'Good lighting and a full-body frame make your next scan more reliable.',
  'A tall, relaxed posture with eyes ahead often steadies your rhythm.',
  'Comfort is the best shoe guide — the pair that feels best usually serves you best.',
  'Re-scanning at a similar time and pace makes your trend easier to read.',
  'Counting steps to a steady beat for a minute can smooth an uneven rhythm.',
  'Swinging your arms easily at your sides often helps your legs find a rhythm.',
];

function hashKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Pick today's tip: deterministic for a given day key (e.g. '2026-07-03'), so
 * the tip rotates daily but doesn't flicker within a day. Report-sourced tips
 * are flagged so the UI can badge them.
 */
export function pickCoachTip(
  latest: CoachSource | null,
  dayKey: string,
): { text: string; source: 'scan' | 'general' } {
  const scanPool: string[] = [];
  if (latest) {
    for (const rec of latest.feedback?.recommendations ?? []) if (rec) scanPool.push(rec);
    if (latest.cadenceTip) scanPool.push(latest.cadenceTip);
  }
  const pool = [...scanPool, ...GENERIC_TIPS];
  const idx = hashKey(dayKey) % pool.length;
  return { text: pool[idx], source: idx < scanPool.length ? 'scan' : 'general' };
}

export interface CoachPlanInput {
  goal: string;
  cadenceSpm: number;
  captureOk?: boolean;
  bouncePct?: number;
  overstrideScore?: number;
  rhythmPct?: number;
  symmetryPct?: number;
}
export interface CoachFocusItem {
  area: string;
  cue: string;
}
export interface CoachPlan {
  headline: string;
  items: CoachFocusItem[];
}

/**
 * Rule-based coaching plan derived straight from the scan's numbers — the always-
 * available fallback when the AI coach is off or rate-limited. Wellness-only,
 * hedged, focused ONLY on the gait metrics.
 */
export function buildCoachPlan(i: CoachPlanInput): CoachPlan {
  if (i.captureOk === false) {
    return {
      headline: 'Let’s get a cleaner scan first.',
      items: [
        {
          area: 'Re-scan',
          cue: 'Record again side-on, whole body in frame, good lighting, and walk the full time — then I can coach from clearer numbers.',
        },
      ],
    };
  }
  const items: CoachFocusItem[] = [];
  if ((i.bouncePct ?? 0) >= 12) {
    items.push({
      area: 'Bounce',
      cue: 'Try quicker, lighter steps — nudge your cadence up a little for 30 seconds and let your steps shorten.',
    });
  }
  if ((i.overstrideScore ?? 0) >= 65) {
    items.push({
      area: 'Foot placement',
      cue: 'Aim to land with your foot a little closer under your hips; a slightly quicker step rate usually helps.',
    });
  }
  if (i.rhythmPct != null && i.rhythmPct > 0 && i.rhythmPct < 70) {
    items.push({
      area: 'Rhythm',
      cue: 'Count your steps to a steady beat (or a metronome) for a minute to even out the timing.',
    });
  }
  if (i.symmetryPct != null && i.symmetryPct > 0 && i.symmetryPct < 75) {
    items.push({
      area: 'Left & right',
      cue: 'Re-check with a clean side-on capture to confirm the left/right difference before reading much into it.',
    });
  }
  if (items.length === 0) {
    items.push({
      area: 'Keep it up',
      cue: 'Your form estimates look solid — re-scan now and then to track how things trend.',
    });
  }
  const headline = `Your cadence is about ${Math.round(i.cadenceSpm)} steps per minute. Here’s what’s worth focusing on from your ${i.goal.replace(/_/g, ' ')} scan.`;
  return { headline, items };
}
