import { Shoe } from '../data/shoes';

export interface ShoeMatch {
  shoe: Shoe;
  /** 0–100 comfort-led match score */
  score: number;
  reason: string;
}

export interface MatchOptions {
  /** the user's goal / use-case: running | walking | gym | daily_comfort | recovery */
  useCase: string;
}

function humanize(useCase: string): string {
  return useCase.replace(/_/g, ' ');
}

/**
 * Comfort-led matching (re-plan): rank by how well a shoe fits the user's
 * stated use-case, NOT by an inferred foot type / pronation. The copy nudges the
 * user to try shoes on and pick what feels most comfortable — the evidence-based
 * approach. Own-product flags are preserved so the UI can label them (FTC).
 */
export function matchShoes(shoes: Shoe[], opts: MatchOptions): ShoeMatch[] {
  return shoes
    .map((shoe) => {
      const fits = shoe.useCase.includes(opts.useCase);
      let score = 60;
      if (fits) score += 30;
      if (shoe.cushion === 'high') score += 5;

      const reason = fits
        ? `Good fit for ${humanize(opts.useCase)} with ${shoe.cushion} cushioning — try a pair on and see how it feels.`
        : `A comfortable all-rounder; not specialized for ${humanize(opts.useCase)}, but comfort is what matters most.`;

      return { shoe, score: Math.min(100, score), reason };
    })
    .sort((a, b) => b.score - a.score);
}
