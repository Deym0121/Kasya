import { describe, it, expect } from 'vitest';
import { sanitizeShoePicks, SHOE_BANNED } from '../shoeRank';
import { Shoe } from '../../data/shoes';

const catalog: Shoe[] = [
  { id: 'a1', brand: 'A', model: 'One', category: 'neutral', cushion: 'high', useCase: ['running'], priceMin: 5000, priceMax: 6000, tier: 'premium', tags: [] },
  { id: 'a2', brand: 'A', model: 'Two', category: 'neutral', cushion: 'low', useCase: ['running'], priceMin: 4000, priceMax: 4500, tier: 'midrange', tags: [] },
  { id: 'a3', brand: 'B', model: 'Walk', category: 'walking', cushion: 'medium', useCase: ['walking'], priceMin: 1500, priceMax: 2000, tier: 'budget', tags: [] },
  { id: 'a4', brand: 'C', model: 'Mid', category: 'neutral', cushion: 'medium', useCase: ['running'], priceMin: 3000, priceMax: 3500, tier: 'budget', tags: [] },
  { id: 'a5', brand: 'D', model: 'Gym', category: 'gym', cushion: 'low', useCase: ['gym'], priceMin: 3000, priceMax: 3500, tier: 'budget', tags: [] },
];
const opts = { useCase: 'running' };

function noBannedReasons(matches: { reason: string }[]) {
  for (const m of matches) {
    expect(m.reason.trim().length).toBeGreaterThan(0);
    expect(m.reason).not.toMatch(SHOE_BANNED);
  }
}

describe('sanitizeShoePicks', () => {
  it('floats the AI picks to the top in the AI order, then appends the rest', () => {
    const raw = { picks: [
      { id: 'a3', reason: 'comfy for walks — try them on' },
      { id: 'a5', reason: 'stable base for the gym — give them a go' },
      { id: 'a1', reason: 'soft and cushioned — see how they feel' },
    ] };
    const out = sanitizeShoePicks(raw, catalog, opts, 3);
    expect(out.map((m) => m.shoe.id).slice(0, 3)).toEqual(['a3', 'a5', 'a1']);
    expect(out.slice(0, 3).every((m) => m.source === 'ai')).toBe(true);
    expect(out.length).toBe(catalog.length); // whole catalog still shown
    expect(out.slice(3).every((m) => m.source === 'rules')).toBe(true);
    noBannedReasons(out);
  });

  it('ignores ids that are not in the catalog (no invented shoes)', () => {
    const raw = { picks: [{ id: 'a1', reason: 'nice' }, { id: 'ghost-99', reason: 'fake' }, { id: 'a3', reason: 'good' }] };
    const out = sanitizeShoePicks(raw, catalog, opts, 2);
    expect(out.map((m) => m.shoe.id).slice(0, 2)).toEqual(['a1', 'a3']);
    expect(out.find((m) => m.shoe.id === 'ghost-99')).toBeUndefined();
  });

  it('replaces a reason that contains foot-type / medical language with the safe one', () => {
    const raw = { picks: [
      { id: 'a1', reason: 'corrects your overpronation' },
      { id: 'a3', reason: 'good for flat feet' },
      { id: 'a4', reason: 'nice everyday pick — try them on' },
    ] };
    const out = sanitizeShoePicks(raw, catalog, opts, 3);
    const a1 = out.find((m) => m.shoe.id === 'a1')!;
    expect(a1.reason).not.toMatch(/overpronation/i);
    noBannedReasons(out); // none of the returned reasons leak banned words
  });

  it('falls back to the deterministic ranking when too few valid AI picks survive', () => {
    const raw = { picks: [{ id: 'a1', reason: 'only one' }] };
    const out = sanitizeShoePicks(raw, catalog, opts, 3);
    const deterministic = sanitizeShoePicks(null, catalog, opts, 3);
    expect(out.map((m) => m.shoe.id)).toEqual(deterministic.map((m) => m.shoe.id));
    expect(out.every((m) => m.source === 'rules')).toBe(true);
  });

  it('falls back on junk input (null / string / empty)', () => {
    for (const raw of [null, 'garbage', {}, { picks: 'nope' }]) {
      const out = sanitizeShoePicks(raw, catalog, opts, 3);
      expect(out.length).toBe(catalog.length);
      expect(out.every((m) => m.source === 'rules')).toBe(true);
      noBannedReasons(out);
    }
  });

  it('parses a JSON string, even wrapped in a markdown code fence', () => {
    const raw = '```json\n{"picks":[{"id":"a3","reason":"comfy"},{"id":"a5","reason":"stable"},{"id":"a1","reason":"soft"}]}\n```';
    const out = sanitizeShoePicks(raw, catalog, opts, 3);
    expect(out.slice(0, 3).map((m) => m.shoe.id)).toEqual(['a3', 'a5', 'a1']);
    expect(out.slice(0, 3).every((m) => m.source === 'ai')).toBe(true);
  });

  it('de-duplicates a repeated id', () => {
    const raw = { picks: [{ id: 'a1', reason: 'x' }, { id: 'a1', reason: 'again' }, { id: 'a3', reason: 'y' }] };
    const out = sanitizeShoePicks(raw, catalog, opts, 2);
    expect(out.filter((m) => m.shoe.id === 'a1').length).toBe(1);
  });
});
