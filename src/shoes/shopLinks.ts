/**
 * Real, shoppable marketplace links for a shoe.
 *
 * We never render a fake/generated product image. Instead every shoe taps
 * through to a LIVE keyword search on the marketplaces Filipinos actually buy
 * from — where the authentic, retailer-maintained photo and the real current
 * price live. URL templates were verified against the live PH sites (2026):
 *
 *   Shopee   https://shopee.ph/search?keyword=...            (+ &maxPrice=)
 *   TikTok   https://www.tiktok.com/search?q=...             (no reliable price filter)
 *   Lazada   https://www.lazada.com.ph/catalog/?q=...        (+ &price=min-max)
 *   Google   https://www.google.com/search?q=...&tbm=shop    (+ &tbs=...ppr_max:)
 *
 * Pure module (no React Native / network) so it is unit-tested in node.
 */

export type MarketplaceKey = 'shopee' | 'tiktok' | 'lazada' | 'google';

export interface MarketplaceLink {
  key: MarketplaceKey;
  label: string;
  url: string;
}

/** Optional refinements from the user's saved fit profile. */
export interface ShopQuery {
  /** cap results at this PHP price where the marketplace supports it */
  budgetMaxPhp?: number;
  /** nudge the search toward wide-fit listings */
  width?: 'regular' | 'wide';
}

export const MARKETPLACES: { key: MarketplaceKey; label: string }[] = [
  { key: 'shopee', label: 'Shopee' },
  { key: 'tiktok', label: 'TikTok Shop' },
  { key: 'lazada', label: 'Lazada' },
  { key: 'google', label: 'Google Shopping' },
];

/** The search text sent to a marketplace: "Brand Model" (+ "wide" when asked). */
export function shopQueryText(shoe: { brand: string; model: string }, opts: ShopQuery = {}): string {
  const base = `${shoe.brand} ${shoe.model}`.trim();
  return opts.width === 'wide' ? `${base} wide` : base;
}

function buildUrl(key: MarketplaceKey, q: string, budgetMaxPhp?: number): string {
  const enc = encodeURIComponent(q);
  const max = budgetMaxPhp && budgetMaxPhp > 0 ? Math.round(budgetMaxPhp) : undefined;
  switch (key) {
    case 'shopee':
      return `https://shopee.ph/search?keyword=${enc}` + (max ? `&maxPrice=${max}&minPrice=0` : '');
    case 'tiktok':
      // TikTok Shop web search has no dependable price filter — keyword only.
      return `https://www.tiktok.com/search?q=${enc}`;
    case 'lazada':
      return `https://www.lazada.com.ph/catalog/?q=${enc}` + (max ? `&price=0-${max}` : '');
    case 'google':
      return (
        `https://www.google.com/search?q=${enc}&tbm=shop&gl=ph&hl=en` +
        (max ? `&tbs=mr:1,price:1,ppr_min:0,ppr_max:${max}` : '')
      );
  }
}

/** Live search links for this shoe across every marketplace. */
export function marketplaceLinks(shoe: { brand: string; model: string }, opts: ShopQuery = {}): MarketplaceLink[] {
  const q = shopQueryText(shoe, opts);
  return MARKETPLACES.map(({ key, label }) => ({ key, label, url: buildUrl(key, q, opts.budgetMaxPhp) }));
}
