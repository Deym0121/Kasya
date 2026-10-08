import { describe, it, expect } from 'vitest';
import { matchShoes, matchOptionsFor, scoreTone } from '../match';
import { Shoe, SHOES } from '../../data/shoes';

const shoes: Shoe[] = [
  { id: 'run', brand: 'X', model: 'Road', category: 'neutral', cushion: 'high', useCase: ['running'], priceMin: 5000, priceMax: 6000, tier: 'premium', tags: [] },
  { id: 'runLow', brand: 'X', model: 'Minimal', category: 'neutral', cushion: 'low', useCase: ['running'], priceMin: 5000, priceMax: 6000, tier: 'premium', tags: [] },
  { id: 'walk', brand: 'Y', model: 'Walk', category: 'walking', cushion: 'medium', useCase: ['walking'], priceMin: 3000, priceMax: 3500, tier: 'midrange', tags: [] },
  { id: 'own', brand: 'Kasya', model: 'Support Runner', category: 'stability', cushion: 'high', useCase: ['running', 'walking'], priceMin: 1499, priceMax: 1499, tier: 'budget', tags: [], isOwnProduct: true },
];

describe('matchShoes', () => {
  it('ranks the whole catalog and keeps goal-fitting shoes ahead of misfits', () => {
    const ranked = matchShoes(shoes, { useCase: 'running' });
    expect(ranked).toHaveLength(shoes.length); // all shoes, not a filtered subset
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
    expect(ranked[ranked.length - 1].shoe.id).toBe('walk'); // walking-only shoe ranks last for running
  });

  it('gives every match a non-empty, comfort-led reason', () => {
    const ranked = matchShoes(shoes, { useCase: 'running' });
    for (const m of ranked) {
      expect(m.reason.length).toBeGreaterThan(0);
      expect(m.reason.toLowerCase()).not.toMatch(/injur|diagnos|pronation|abnormal|medical|disease/);
    }
  });

  it('is gait-informed: a big bounce nudges more cushioning above less', () => {
    const bouncy = matchShoes(shoes, { useCase: 'running', gait: { bouncePct: 16 } });
    const high = bouncy.find((m) => m.shoe.id === 'run')!; // high cushion
    const low = bouncy.find((m) => m.shoe.id === 'runLow')!; // low cushion
    expect(high.score).toBeGreaterThan(low.score);
    expect(bouncy.find((m) => m.reason.includes('bounce'))).toBeTruthy();
  });

  it('never argues against a high-cushion shoe when bounce looks controlled', () => {
    const ranked = matchShoes(shoes, { useCase: 'running', gait: { bouncePct: 7 } });
    const high = ranked.find((m) => m.shoe.id === 'run')!; // high cushion
    const low = ranked.find((m) => m.shoe.id === 'runLow')!; // low cushion
    // The reason for a high-cushion shoe must not pitch a lighter, responsive pair.
    expect(high.reason).not.toMatch(/lighter, responsive/);
    expect(high.reason).toMatch(/comfort choice/);
    // Low/medium cushion keeps the lighter/responsive phrasing.
    expect(low.reason).toMatch(/lighter, responsive/);
  });

  it('is gait-informed: a very quick cadence gives lighter, lower-stack shoes a small edge', () => {
    const base = matchShoes(shoes, { useCase: 'running' });
    const quick = matchShoes(shoes, { useCase: 'running', gait: { cadenceSpm: 175 } });
    const lowBase = base.find((m) => m.shoe.id === 'runLow')!;
    const lowQuick = quick.find((m) => m.shoe.id === 'runLow')!;
    const highBase = base.find((m) => m.shoe.id === 'run')!;
    const highQuick = quick.find((m) => m.shoe.id === 'run')!;
    expect(lowQuick.score).toBeGreaterThan(lowBase.score);
    expect(highQuick.score).toBe(highBase.score);
    // Smaller than the bounce nudge, so it can only reorder near-ties.
    expect(lowQuick.score - lowBase.score).toBeLessThan(9);
    // Scan-specific reason phrase — hedged, and never against the shoe it describes.
    expect(lowQuick.reason).toMatch(/cadence/);
    expect(highQuick.reason).not.toMatch(/lower-stack/);
  });

  it('is gait-informed: a notably slow cadence gives cushioned shoes a small edge', () => {
    const base = matchShoes(shoes, { useCase: 'running' });
    const slow = matchShoes(shoes, { useCase: 'running', gait: { cadenceSpm: 135 } });
    const highBase = base.find((m) => m.shoe.id === 'run')!;
    const highSlow = slow.find((m) => m.shoe.id === 'run')!;
    const lowBase = base.find((m) => m.shoe.id === 'runLow')!;
    const lowSlow = slow.find((m) => m.shoe.id === 'runLow')!;
    expect(highSlow.score).toBeGreaterThan(highBase.score);
    expect(lowSlow.score).toBe(lowBase.score);
    expect(highSlow.score - highBase.score).toBeLessThan(9);
    expect(highSlow.reason).toMatch(/cadence/);
  });

  it('leaves scores alone when cadence sits in the everyday range', () => {
    const base = matchShoes(shoes, { useCase: 'running' });
    const mid = matchShoes(shoes, { useCase: 'running', gait: { cadenceSpm: 155 } });
    for (const m of base) {
      expect(mid.find((x) => x.shoe.id === m.shoe.id)!.score).toBe(m.score);
    }
  });

  it('ignores a cadence of 0 — an unmeasured cadence must never drive advice', () => {
    const base = matchShoes(shoes, { useCase: 'running' });
    const zero = matchShoes(shoes, { useCase: 'running', gait: { cadenceSpm: 0 } });
    for (const m of base) {
      const z = zero.find((x) => x.shoe.id === m.shoe.id)!;
      expect(z.score).toBe(m.score);
      expect(z.reason).not.toMatch(/cadence/i);
    }
  });

  it('keeps every invariant with both nudges at their extremes', () => {
    const combos = [
      { cadenceSpm: 120, bouncePct: 20 },
      { cadenceSpm: 190, bouncePct: 5 },
      { cadenceSpm: 190, bouncePct: 20 },
      { cadenceSpm: 120, bouncePct: 5 },
    ];
    for (const gait of combos) {
      const ranked = matchShoes(shoes, { useCase: 'running', gait });
      for (const m of ranked) {
        expect(m.score).toBeGreaterThanOrEqual(0);
        expect(m.score).toBeLessThanOrEqual(100);
        expect(m.reason.length).toBeGreaterThan(0);
        expect(m.reason.toLowerCase()).not.toMatch(/injur|diagnos|pronation|abnormal|medical|disease/);
      }
      // Goal-fitting shoes stay ahead of the walking-only misfit.
      expect(ranked[ranked.length - 1].shoe.id).toBe('walk');
      // Our own product still never floats above an equally-scored rival.
      const ownIdx = ranked.findIndex((m) => m.shoe.isOwnProduct);
      if (ownIdx > 0) {
        expect(ranked[ownIdx - 1].score).toBeGreaterThanOrEqual(ranked[ownIdx].score);
      }
    }
  });

  it('flags the founder’s own product and never ranks it above an equal rival (FTC)', () => {
    const ranked = matchShoes(shoes, { useCase: 'running' });
    const own = ranked.find((m) => m.shoe.id === 'own');
    expect(own?.shoe.isOwnProduct).toBe(true);
    // If our product ties a rival, the rival sorts first.
    const ownIdx = ranked.findIndex((m) => m.shoe.isOwnProduct);
    if (ownIdx > 0) {
      expect(ranked[ownIdx - 1].score).toBeGreaterThanOrEqual(ranked[ownIdx].score);
    }
  });
});

describe('budget-aware matching', () => {
  it('ranks a within-budget shoe above an over-budget rival for the same goal', () => {
    const ranked = matchShoes(shoes, { useCase: 'running', budgetMaxPhp: 4000 });
    const ownIdx = ranked.findIndex((m) => m.shoe.id === 'own'); // ₱1,499 — fits the budget
    const runIdx = ranked.findIndex((m) => m.shoe.id === 'run'); // ₱5,000+ — over budget
    expect(ownIdx).toBeLessThan(runIdx);
    expect(ranked.find((m) => m.shoe.id === 'own')!.reason).toMatch(/budget/i);
    expect(ranked.find((m) => m.shoe.id === 'run')!.reason).toMatch(/above your/i);
  });

  it('never mentions budget when none is set', () => {
    for (const m of matchShoes(shoes, { useCase: 'running' })) {
      expect(m.reason.toLowerCase()).not.toContain('budget');
    }
  });
});

describe('scoreTone', () => {
  it('buckets scores into strong / good / fair', () => {
    expect(scoreTone(95)).toBe('strong');
    expect(scoreTone(90)).toBe('strong');
    expect(scoreTone(80)).toBe('good');
    expect(scoreTone(60)).toBe('fair');
  });
});

describe('8. unmeasured bounce', () => {
  it('treats bounce = 0 as not measured — never "controlled", and no score nudge', () => {
    const base = matchShoes(shoes, { useCase: 'running' });
    const zero = matchShoes(shoes, { useCase: 'running', gait: { bouncePct: 0 } });
    for (const m of base) {
      const z = zero.find((x) => x.shoe.id === m.shoe.id)!;
      expect(z.score).toBe(m.score);
      expect(z.reason).not.toMatch(/controlled|bounce/i);
    }
    for (const m of matchShoes(SHOES, { useCase: 'walking', gait: { bouncePct: 0 } })) {
      expect(m.reason).not.toMatch(/controlled/i);
    }
  });
});

describe('9. budget is respected', () => {
  const GOALS = ['running', 'walking', 'gym', 'recovery', 'daily_comfort'];

  it('never ranks an over-budget shoe above one that fits (real catalog, tight budgets)', () => {
    for (const useCase of GOALS) {
      for (const budgetMaxPhp of [500, 1000, 2000, 5000]) {
        const ranked = matchShoes(SHOES, { useCase, budgetMaxPhp });
        const firstOver = ranked.findIndex((m) => m.overBudget);
        const lastFit = ranked.map((m) => !m.overBudget).lastIndexOf(true);
        if (firstOver >= 0 && lastFit >= 0) expect(lastFit).toBeLessThan(firstOver);
        const fitting = SHOES.filter((s) => s.priceMin <= budgetMaxPhp).length;
        for (const m of ranked.slice(0, Math.min(5, fitting))) expect(m.shoe.priceMin).toBeLessThanOrEqual(budgetMaxPhp);
        for (const m of ranked.filter((x) => x.overBudget)) expect(m.reason).toMatch(/above your/);
      }
    }
  });

  it('a ₱1,000 running budget gets a top-5 that is entirely within budget', () => {
    const top5 = matchShoes(SHOES, { useCase: 'running', budgetMaxPhp: 1000 }).slice(0, 5);
    expect(top5.every((m) => m.shoe.priceMin <= 1000 && !m.overBudget)).toBe(true);
  });

  it('when nothing fits, leads with the closest-priced pairs, explicitly labelled', () => {
    const ranked = matchShoes(SHOES, { useCase: 'running', budgetMaxPhp: 250 });
    expect(ranked).toHaveLength(SHOES.length);
    expect(ranked.every((m) => m.overBudget === 'closest')).toBe(true);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].shoe.priceMin).toBeGreaterThanOrEqual(ranked[i - 1].shoe.priceMin);
    }
    expect(ranked[0].reason).toMatch(/^Closest over your ₱250 budget/);
    expect(ranked[0].reason).not.toMatch(/Usually sells above/);
  });

  it('labels nothing when no budget is set', () => {
    expect(matchShoes(SHOES, { useCase: 'running' }).some((m) => m.overBudget)).toBe(false);
  });
});

describe('10. one set of matcher inputs for every surface (Home top-3 included)', () => {
  const report = {
    scanType: 'running',
    result: { cadence: { value: 172, confidence: 'high' } },
    metrics: { verticalOscillationPct: 9 },
  };

  it('carries the saved fit-profile budget, so Home’s top-3 respects it', () => {
    const opts = matchOptionsFor(report, { budgetMaxPhp: 2000 });
    expect(opts.budgetMaxPhp).toBe(2000);
    const top3 = matchShoes(SHOES, opts).slice(0, 3);
    expect(top3.every((m) => m.shoe.priceMin <= 2000)).toBe(true);
    expect(matchOptionsFor(report).budgetMaxPhp).toBeUndefined();
    expect(matchOptionsFor(report, {}).budgetMaxPhp).toBeUndefined();
  });

  it('passes gait signals only when measured and trustworthy', () => {
    expect(matchOptionsFor(report).gait).toEqual({ cadenceSpm: 172, bouncePct: 9 });
    expect(matchOptionsFor({ ...report, metrics: { verticalOscillationPct: 0 } }).gait).toEqual({ cadenceSpm: 172 });
    expect(matchOptionsFor({ ...report, result: { cadence: { value: 172, confidence: 'low' } } }).gait).toEqual({});
    expect(matchOptionsFor({ ...report, result: { cadence: { value: 0, confidence: 'medium' } } }).gait).toEqual({
      bouncePct: 9,
    });
  });
});

describe('11. neutral, deterministic tie ordering', () => {
  const tie = (id: string, tier: Shoe['tier'], priceMin: number, tone?: 'well_regarded' | 'solid' | 'mixed'): Shoe => ({
    id,
    brand: id,
    model: id,
    category: 'neutral',
    cushion: 'medium',
    useCase: ['running'],
    priceMin,
    priceMax: priceMin + 500,
    tier,
    tags: [],
    ...(tone ? { quality: { tone, note: 'n' } } : {}),
  });
  // Listed premium-first, like the real catalog.
  const tied = [
    tie('premium-a', 'premium', 9000),
    tie('premium-b', 'premium', 8000, 'solid'),
    tie('mid', 'midrange', 4000, 'solid'),
    tie('budget', 'budget', 1200),
    tie('praised', 'midrange', 6000, 'well_regarded'),
  ];

  it('breaks score ties by public-review reputation, then price ascending — not listing order', () => {
    const ranked = matchShoes(tied, { useCase: 'running' });
    expect(new Set(ranked.map((m) => m.score)).size).toBe(1);
    expect(ranked.map((m) => m.shoe.id)).toEqual(['praised', 'mid', 'premium-b', 'budget', 'premium-a']);
  });

  it('gives the same order whatever order the catalog is listed in', () => {
    const a = matchShoes(SHOES, { useCase: 'running' }).map((m) => m.shoe.id);
    const b = matchShoes([...SHOES].reverse(), { useCase: 'running' }).map((m) => m.shoe.id);
    expect(b).toEqual(a);
  });
});
