import { describe, it, expect } from 'vitest';
import { matchShoes } from '../match';
import { Shoe } from '../../data/shoes';

const shoes: Shoe[] = [
  { id: 'run', brand: 'X', model: 'Road', category: 'neutral', cushion: 'high', useCase: ['running'], priceMin: 5000, priceMax: 6000, tags: [] },
  { id: 'walk', brand: 'Y', model: 'Walk', category: 'walking', cushion: 'medium', useCase: ['walking'], priceMin: 3000, priceMax: 3500, tags: [] },
  { id: 'own', brand: 'StrideFit', model: 'Support Runner', category: 'stability', cushion: 'high', useCase: ['running', 'walking'], priceMin: 1499, priceMax: 1499, tags: [], isOwnProduct: true },
];

describe('matchShoes', () => {
  it('ranks shoes that fit the chosen use-case higher', () => {
    const ranked = matchShoes(shoes, { useCase: 'running' });
    expect(ranked).toHaveLength(3);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
    expect(ranked[ranked.length - 1].shoe.id).toBe('walk'); // walking-only shoe ranks last for running
  });

  it('gives every match a non-empty, comfort-led reason', () => {
    const ranked = matchShoes(shoes, { useCase: 'running' });
    for (const m of ranked) {
      expect(m.reason.length).toBeGreaterThan(0);
    }
  });

  it('flags the founder’s own product so the UI can label it (FTC)', () => {
    const ranked = matchShoes(shoes, { useCase: 'running' });
    const own = ranked.find((m) => m.shoe.id === 'own');
    expect(own?.shoe.isOwnProduct).toBe(true);
  });
});
