import { describe, it, expect } from 'vitest';
import { SHOES, Shoe } from '../shoes';

const TIERS = ['premium', 'midrange', 'budget'];

describe('shoe catalog integrity', () => {
  it('never ships a generated / placeholder image host (the old bug)', () => {
    for (const s of SHOES) {
      if (s.image) {
        expect(s.image).toMatch(/^https:\/\//);
        expect(s.image).not.toMatch(/loremflickr|picsum|placeholder|placekitten|unsplash|dummyimage/i);
      }
    }
  });

  it('gives every shoe a brand, model, valid tier and sane price band', () => {
    for (const s of SHOES) {
      expect(s.brand.trim().length).toBeGreaterThan(0);
      expect(s.model.trim().length).toBeGreaterThan(0);
      expect(TIERS).toContain(s.tier);
      expect(s.priceMin).toBeGreaterThan(0);
      expect(s.priceMax).toBeGreaterThanOrEqual(s.priceMin);
    }
  });

  it('has unique ids', () => {
    const ids = SHOES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ships no fake house-brand SKU', () => {
    expect(SHOES.some((s) => s.isOwnProduct)).toBe(false);
  });

  it('spans all price tiers so budget/China buyers are covered too', () => {
    const tiers = new Set(SHOES.map((s) => s.tier));
    expect(tiers.has('premium')).toBe(true);
    expect(tiers.has('budget')).toBe(true);
    // real affordable options exist (not just premium)
    expect(SHOES.some((s: Shoe) => s.priceMax <= 2500)).toBe(true);
  });

  it('is a broad catalog, not a hand-picked few', () => {
    expect(SHOES.length).toBeGreaterThanOrEqual(30);
  });

  it('has a meaningful set of broadly-praised shoes (drives the Top quality badge)', () => {
    const top = SHOES.filter((s) => s.quality?.tone === 'well_regarded');
    expect(top.length).toBeGreaterThanOrEqual(5);
    // and the badge tier spans price tiers, not just premium
    expect(top.some((s) => s.tier !== 'premium')).toBe(true);
  });

  it('keeps quality notes short, hedged-safe and honestly toned', () => {
    for (const s of SHOES) {
      if (!s.quality) continue;
      expect(['well_regarded', 'solid', 'mixed']).toContain(s.quality.tone);
      expect(s.quality.note.trim().length).toBeGreaterThan(0);
      expect(s.quality.note.length).toBeLessThanOrEqual(90);
      expect(s.quality.note.toLowerCase()).not.toMatch(
        /injur|diagnos|pronat|abnormal|medical|disease|corrects|guarantee|best in the world/,
      );
    }
  });
});
