import { describe, it, expect } from 'vitest';
import { marketplaceLinks, shopQueryText, MARKETPLACES } from '../shopLinks';

const shoe = { brand: 'New Balance', model: 'Fresh Foam X 1080v14' };

describe('shopQueryText', () => {
  it('is the brand and model joined', () => {
    expect(shopQueryText({ brand: 'Nike', model: 'Pegasus 41' })).toBe('Nike Pegasus 41');
  });

  it('adds "wide" only when the fit profile asks for a wide fit', () => {
    expect(shopQueryText({ brand: 'Nike', model: 'Pegasus 41' }, { width: 'wide' })).toBe('Nike Pegasus 41 wide');
    expect(shopQueryText({ brand: 'Nike', model: 'Pegasus 41' }, { width: 'regular' })).toBe('Nike Pegasus 41');
  });
});

describe('marketplaceLinks', () => {
  it('returns a link for every known marketplace', () => {
    const links = marketplaceLinks(shoe);
    expect(links.map((l) => l.key).sort()).toEqual(['google', 'lazada', 'shopee', 'tiktok']);
    expect(links.length).toBe(MARKETPLACES.length);
  });

  it('points each marketplace at its verified PH search endpoint', () => {
    const by = Object.fromEntries(marketplaceLinks(shoe).map((l) => [l.key, l.url]));
    expect(by.shopee).toMatch(/^https:\/\/shopee\.ph\/search\?keyword=/);
    expect(by.lazada).toMatch(/^https:\/\/www\.lazada\.com\.ph\/catalog\/\?q=/);
    expect(by.tiktok).toMatch(/^https:\/\/www\.tiktok\.com\/search\?q=/);
    expect(by.google).toMatch(/^https:\/\/www\.google\.com\/search\?/);
    expect(by.google).toContain('tbm=shop');
  });

  it('url-encodes the brand + model so spaces never break the link', () => {
    const shopee = marketplaceLinks(shoe).find((l) => l.key === 'shopee')!.url;
    expect(shopee).toContain('New%20Balance%20Fresh%20Foam%20X%201080v14');
    expect(shopee).not.toContain(' ');
  });

  it('adds a max-price filter where the marketplace supports one, never on TikTok', () => {
    const by = Object.fromEntries(marketplaceLinks(shoe, { budgetMaxPhp: 2000 }).map((l) => [l.key, l.url]));
    expect(by.shopee).toContain('maxPrice=2000');
    expect(by.lazada).toContain('price=0-2000');
    expect(by.google).toContain('ppr_max:2000');
    expect(by.tiktok).not.toMatch(/price/i); // TikTok web search has no reliable price filter
  });

  it('omits the price filter when no budget is set', () => {
    for (const l of marketplaceLinks(shoe)) {
      expect(l.url).not.toMatch(/maxPrice|ppr_max|price=/);
    }
  });

  it('carries a human label for each marketplace', () => {
    for (const l of marketplaceLinks(shoe)) {
      expect(l.label.length).toBeGreaterThan(0);
    }
  });
});
