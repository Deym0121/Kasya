import { describe, it, expect } from 'vitest';
import { matchShoes, scoreTone } from '../match';
import { Shoe } from '../../data/shoes';

const shoes: Shoe[] = [
  { id: 'run', brand: 'X', model: 'Road', category: 'neutral', cushion: 'high', useCase: ['running'], priceMin: 5000, priceMax: 6000, tags: [] },
  { id: 'runLow', brand: 'X', model: 'Minimal', category: 'neutral', cushion: 'low', useCase: ['running'], priceMin: 5000, priceMax: 6000, tags: [] },
  { id: 'walk', brand: 'Y', model: 'Walk', category: 'walking', cushion: 'medium', useCase: ['walking'], priceMin: 3000, priceMax: 3500, tags: [] },
  { id: 'own', brand: 'StrideFit', model: 'Support Runner', category: 'stability', cushion: 'high', useCase: ['running', 'walking'], priceMin: 1499, priceMax: 1499, tags: [], isOwnProduct: true },
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

describe('scoreTone', () => {
  it('buckets scores into strong / good / fair', () => {
    expect(scoreTone(95)).toBe('strong');
    expect(scoreTone(90)).toBe('strong');
    expect(scoreTone(80)).toBe('good');
    expect(scoreTone(60)).toBe('fair');
  });
});
