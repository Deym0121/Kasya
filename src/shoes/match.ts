import { Shoe } from '../data/shoes';

export interface ShoeMatch {
  shoe: Shoe;
  /** 0–100 comfort-led match score */
  score: number;
  reason: string;
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
  if (bouncePct == null) {
    return { delta: cushion === 'high' ? 4 : cushion === 'medium' ? 2 : 0, note: '' };
  }
  if (bouncePct >= 12) {
    return {
      delta: cushion === 'high' ? 9 : cushion === 'medium' ? 4 : -3,
      note: 'you bounce a fair bit, so more cushioning may feel smoother',
    };
  }
  return {
    delta: cushion === 'medium' ? 5 : cushion === 'low' ? 3 : 2,
    note: 'your bounce looks controlled, so a lighter, responsive pair suits you',
  };
}

/**
 * Comfort-led, gait-informed matching (re-plan): rank the WHOLE catalog by how
 * well each shoe fits the user's goal AND the way they actually move (soft
 * signals from the scan) — NOT by an inferred foot type / pronation. Copy always
 * nudges the user to try shoes on and pick what feels most comfortable. Own
 * products are flagged (FTC) and never ranked above an equally-scored rival.
 */
export function matchShoes(shoes: Shoe[], opts: MatchOptions): ShoeMatch[] {
  const goal = opts.useCase;
  const bounce = opts.gait?.bouncePct;
  const suited = GOAL_CATEGORIES[goal] ?? [];

  return shoes
    .map((shoe) => {
      const fits = shoe.useCase.includes(goal);
      const cushion = cushionComfort(shoe.cushion, bounce);
      let score = 55;
      if (fits) score += 25;
      if (suited.includes(shoe.category)) score += 5;
      score += cushion.delta;
      score = Math.max(0, Math.min(100, score));

      let reason: string;
      if (fits) {
        reason = `Good for ${humanize(goal)} with ${shoe.cushion} cushioning`;
        reason += cushion.note ? ` — ${cushion.note}.` : '.';
        reason += ' Try a pair on and see how they feel.';
      } else {
        reason = `A comfortable all-rounder — not specialized for ${humanize(goal)}, but comfort is what matters most.`;
      }

      return { shoe, score, reason };
    })
    // Score first; on a tie, never float our own product above a rival.
    .sort((a, b) => b.score - a.score || (a.shoe.isOwnProduct ? 1 : 0) - (b.shoe.isOwnProduct ? 1 : 0));
}
