import { describe, it, expect } from 'vitest';
import { matchShoes, scoreTone } from '../match';
import { Shoe } from '../../data/shoes';

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
