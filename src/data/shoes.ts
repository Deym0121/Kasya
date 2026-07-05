/** A shoe in the catalog. Facts only (no scraped prose, no generated images). */
export interface Shoe {
  id: string;
  brand: string;
  model: string;
  category: string; // neutral | stability | max_cushion | walking | trail | gym | recovery
  cushion: 'low' | 'medium' | 'high';
  useCase: string[]; // running | walking | gym | daily_comfort | recovery | trail
  priceMin: number; // approximate PH street price band, PHP
  priceMax: number;
  /** price tier so budget / China-brand buyers are surfaced too */
  tier: 'premium' | 'midrange' | 'budget';
  tags: string[];
  isOwnProduct?: boolean;
  /**
   * A real product photo URL — ONLY when we have one we control/host. We never
   * hotlink retailer CDNs (hotlink protection + CORS + link rot) and never use a
   * generated/random image. When absent the UI shows an honest brand glyph and
   * taps through to the live Shopee/TikTok listing where the authentic photo lives.
   */
  image?: string;
}

/**
 * Real PH-market catalog across every price tier — premium global brands AND the
 * affordable local / Chinese brands people actually buy on Shopee & TikTok Shop.
 * Prices are approximate bands (₱); the live marketplace search (see shopLinks.ts)
 * is the source of truth for the real current price and the authentic photo.
 *
 * Seeded from a verified 2026 research pass. Swap this static seed for a live
 * marketplace/affiliate feed later — the UI + matcher don't care where it comes from.
 */
export const SHOES: Shoe[] = [
  // ── Premium / global ────────────────────────────────────────────────────────
  { id: 'asics-gel-nimbus-27', brand: 'Asics', model: 'Gel-Nimbus 27', category: 'max_cushion', cushion: 'high', useCase: ['running', 'daily_comfort'], priceMin: 11000, priceMax: 13000, tier: 'premium', tags: ['plush', 'neutral', 'long-run'] },
  { id: 'asics-gel-kayano-32', brand: 'Asics', model: 'Gel-Kayano 32', category: 'stability', cushion: 'high', useCase: ['running', 'daily_comfort'], priceMin: 10500, priceMax: 12000, tier: 'premium', tags: ['stability', 'support', 'structured'] },
  { id: 'asics-novablast-5', brand: 'Asics', model: 'Novablast 5', category: 'neutral', cushion: 'high', useCase: ['running', 'daily_comfort'], priceMin: 8500, priceMax: 9500, tier: 'premium', tags: ['bouncy', 'versatile', 'daily-trainer'] },
  { id: 'asics-gel-cumulus-27', brand: 'Asics', model: 'Gel-Cumulus 27', category: 'neutral', cushion: 'medium', useCase: ['running', 'daily_comfort'], priceMin: 7500, priceMax: 8800, tier: 'midrange', tags: ['neutral', 'everyday'] },
  { id: 'nike-pegasus-41', brand: 'Nike', model: 'Pegasus 41', category: 'neutral', cushion: 'medium', useCase: ['running', 'daily_comfort', 'gym'], priceMin: 7000, priceMax: 8500, tier: 'premium', tags: ['versatile', 'daily-trainer', 'responsive'] },
  { id: 'nike-vomero-18', brand: 'Nike', model: 'Vomero 18', category: 'max_cushion', cushion: 'high', useCase: ['running', 'daily_comfort'], priceMin: 8000, priceMax: 9500, tier: 'premium', tags: ['plush', 'max-cushion', 'long-run'] },
  { id: 'nike-infinityrn-4', brand: 'Nike', model: 'InfinityRN 4', category: 'neutral', cushion: 'high', useCase: ['running', 'daily_comfort'], priceMin: 8000, priceMax: 10000, tier: 'premium', tags: ['supportive', 'soft', 'smooth'] },
  { id: 'brooks-ghost-18', brand: 'Brooks', model: 'Ghost 18', category: 'neutral', cushion: 'medium', useCase: ['running', 'daily_comfort', 'walking'], priceMin: 7000, priceMax: 8000, tier: 'premium', tags: ['smooth', 'versatile', 'daily-trainer'] },
  { id: 'brooks-glycerin-23', brand: 'Brooks', model: 'Glycerin 23', category: 'max_cushion', cushion: 'high', useCase: ['running', 'daily_comfort'], priceMin: 9000, priceMax: 10000, tier: 'premium', tags: ['plush', 'soft', 'long-run'] },
  { id: 'brooks-adrenaline-gts-25', brand: 'Brooks', model: 'Adrenaline GTS 25', category: 'stability', cushion: 'medium', useCase: ['running', 'daily_comfort', 'walking'], priceMin: 7800, priceMax: 8800, tier: 'premium', tags: ['stability', 'guiderails', 'support'] },
  { id: 'hoka-clifton-10', brand: 'Hoka', model: 'Clifton 10', category: 'max_cushion', cushion: 'high', useCase: ['running', 'daily_comfort', 'walking'], priceMin: 8500, priceMax: 9800, tier: 'premium', tags: ['lightweight', 'cushioned', 'versatile'] },
  { id: 'hoka-bondi-9', brand: 'Hoka', model: 'Bondi 9', category: 'max_cushion', cushion: 'high', useCase: ['running', 'daily_comfort', 'walking', 'recovery'], priceMin: 10000, priceMax: 11500, tier: 'premium', tags: ['max-cushion', 'plush', 'all-day'] },
  { id: 'hoka-arahi-7', brand: 'Hoka', model: 'Arahi 7', category: 'stability', cushion: 'high', useCase: ['running', 'daily_comfort', 'walking'], priceMin: 8500, priceMax: 10000, tier: 'premium', tags: ['stability', 'lightweight', 'support'] },
  { id: 'hoka-speedgoat-6', brand: 'Hoka', model: 'Speedgoat 6', category: 'trail', cushion: 'high', useCase: ['trail', 'running'], priceMin: 9500, priceMax: 11000, tier: 'premium', tags: ['trail', 'grippy', 'vibram'] },
  { id: 'nb-1080v14', brand: 'New Balance', model: 'Fresh Foam X 1080v14', category: 'max_cushion', cushion: 'high', useCase: ['running', 'daily_comfort', 'walking'], priceMin: 8500, priceMax: 10500, tier: 'premium', tags: ['plush', 'premium-daily', 'long-run'] },
  { id: 'nb-880v14', brand: 'New Balance', model: 'Fresh Foam X 880v14', category: 'neutral', cushion: 'high', useCase: ['running', 'daily_comfort'], priceMin: 7000, priceMax: 8500, tier: 'premium', tags: ['neutral', 'daily-trainer', 'reliable'] },
  { id: 'nb-rebel-v4', brand: 'New Balance', model: 'FuelCell Rebel v4', category: 'neutral', cushion: 'medium', useCase: ['running'], priceMin: 7500, priceMax: 9000, tier: 'premium', tags: ['lightweight', 'bouncy', 'tempo'] },
  { id: 'adidas-ultraboost-5', brand: 'Adidas', model: 'Ultraboost 5', category: 'neutral', cushion: 'high', useCase: ['running', 'daily_comfort', 'walking'], priceMin: 9000, priceMax: 12000, tier: 'premium', tags: ['boost', 'lifestyle', 'plush'] },
  { id: 'adidas-supernova-rise', brand: 'Adidas', model: 'Supernova Rise', category: 'neutral', cushion: 'high', useCase: ['running', 'daily_comfort'], priceMin: 6500, priceMax: 8500, tier: 'midrange', tags: ['daily-trainer', 'cushioned'] },
  { id: 'adidas-adizero-sl-2', brand: 'Adidas', model: 'Adizero SL 2', category: 'neutral', cushion: 'medium', useCase: ['running'], priceMin: 6000, priceMax: 8000, tier: 'midrange', tags: ['lightweight', 'tempo', 'fast'] },
  { id: 'saucony-triumph-23', brand: 'Saucony', model: 'Triumph 23', category: 'max_cushion', cushion: 'high', useCase: ['running', 'daily_comfort'], priceMin: 9500, priceMax: 11000, tier: 'premium', tags: ['plush', 'soft', 'long-run'] },
  { id: 'saucony-ride-18', brand: 'Saucony', model: 'Ride 18', category: 'neutral', cushion: 'medium', useCase: ['running', 'daily_comfort'], priceMin: 8000, priceMax: 9500, tier: 'premium', tags: ['neutral', 'daily-trainer', 'smooth'] },
  { id: 'saucony-endorphin-speed-5', brand: 'Saucony', model: 'Endorphin Speed 5', category: 'neutral', cushion: 'high', useCase: ['running'], priceMin: 11000, priceMax: 12500, tier: 'premium', tags: ['plated', 'tempo', 'race-day'] },
  { id: 'skechers-gowalk-arch-fit', brand: 'Skechers', model: 'Go Walk Arch Fit', category: 'walking', cushion: 'high', useCase: ['walking', 'daily_comfort'], priceMin: 5000, priceMax: 6500, tier: 'midrange', tags: ['walking', 'arch-support', 'all-day'] },
  { id: 'skechers-max-cushioning-elite', brand: 'Skechers', model: 'Max Cushioning Elite', category: 'max_cushion', cushion: 'high', useCase: ['walking', 'running', 'daily_comfort', 'recovery'], priceMin: 5500, priceMax: 7000, tier: 'midrange', tags: ['thick-sole', 'comfort', 'all-day'] },
  { id: 'skechers-gorun-ride-11', brand: 'Skechers', model: 'GoRun Ride 11', category: 'neutral', cushion: 'high', useCase: ['running', 'daily_comfort'], priceMin: 5500, priceMax: 7000, tier: 'midrange', tags: ['lightweight', 'value', 'cushioned'] },
  { id: 'puma-velocity-nitro-4', brand: 'Puma', model: 'Velocity Nitro 4', category: 'neutral', cushion: 'medium', useCase: ['running', 'daily_comfort'], priceMin: 6000, priceMax: 7600, tier: 'midrange', tags: ['nitro-foam', 'daily-trainer', 'value'] },
  { id: 'puma-deviate-nitro-3', brand: 'Puma', model: 'Deviate Nitro 3', category: 'neutral', cushion: 'high', useCase: ['running'], priceMin: 9000, priceMax: 11000, tier: 'premium', tags: ['plated', 'tempo', 'race-day'] },
  { id: 'puma-magnify-nitro-2', brand: 'Puma', model: 'Magnify Nitro 2', category: 'max_cushion', cushion: 'high', useCase: ['running', 'daily_comfort'], priceMin: 7000, priceMax: 8500, tier: 'midrange', tags: ['max-cushion', 'plush', 'long-run'] },
  { id: 'mizuno-wave-rider-29', brand: 'Mizuno', model: 'Wave Rider 29', category: 'neutral', cushion: 'medium', useCase: ['running', 'daily_comfort'], priceMin: 8000, priceMax: 9500, tier: 'premium', tags: ['neutral', 'enerzy', 'daily-trainer'] },
  { id: 'mizuno-wave-inspire-22', brand: 'Mizuno', model: 'Wave Inspire 22', category: 'stability', cushion: 'medium', useCase: ['running', 'daily_comfort'], priceMin: 8000, priceMax: 11000, tier: 'premium', tags: ['stability', 'support', 'wave-plate'] },
  { id: 'on-cloudmonster-2', brand: 'On', model: 'Cloudmonster 2', category: 'max_cushion', cushion: 'high', useCase: ['running', 'daily_comfort'], priceMin: 11000, priceMax: 14000, tier: 'premium', tags: ['cloudtec', 'bouncy', 'max-cushion'] },
  { id: 'on-cloudsurfer-2', brand: 'On', model: 'Cloudsurfer 2', category: 'neutral', cushion: 'high', useCase: ['running', 'daily_comfort'], priceMin: 9500, priceMax: 12500, tier: 'premium', tags: ['cloudtec', 'smooth', 'daily-trainer'] },
  { id: 'on-cloud-5', brand: 'On', model: 'Cloud 5', category: 'walking', cushion: 'medium', useCase: ['walking', 'daily_comfort', 'gym'], priceMin: 8500, priceMax: 10500, tier: 'premium', tags: ['lifestyle', 'lightweight', 'everyday'] },

  // ── Affordable / local / Chinese brands (Shopee & TikTok Shop) ───────────────
  { id: 'worldbalance-airspeed', brand: 'World Balance', model: 'Airspeed', category: 'neutral', cushion: 'medium', useCase: ['running', 'walking', 'daily_comfort'], priceMin: 900, priceMax: 1800, tier: 'budget', tags: ['local-brand', 'filipino', 'lightweight'] },
  { id: 'worldbalance-walker', brand: 'World Balance', model: 'Walking Shoe', category: 'walking', cushion: 'medium', useCase: ['walking', 'daily_comfort'], priceMin: 800, priceMax: 1600, tier: 'budget', tags: ['local-brand', 'filipino', 'everyday'] },
  { id: 'worldbalance-oneup', brand: 'World Balance', model: 'One Up Runner', category: 'neutral', cushion: 'medium', useCase: ['running', 'walking', 'daily_comfort'], priceMin: 700, priceMax: 1400, tier: 'budget', tags: ['local-brand', 'filipino', 'value'] },
  { id: 'anta-flashfoam', brand: 'ANTA', model: 'Flashfoam Running', category: 'neutral', cushion: 'high', useCase: ['running', 'daily_comfort'], priceMin: 1800, priceMax: 3500, tier: 'midrange', tags: ['chinese-brand', 'cushioned', 'official-store'] },
  { id: 'anta-running-trainer', brand: 'ANTA', model: 'Running Trainer', category: 'stability', cushion: 'medium', useCase: ['running', 'gym', 'walking'], priceMin: 1500, priceMax: 2800, tier: 'midrange', tags: ['chinese-brand', 'supportive', 'trainer'] },
  { id: '361-spire-4', brand: '361 Degrees', model: 'Spire 4', category: 'max_cushion', cushion: 'high', useCase: ['running', 'daily_comfort'], priceMin: 1800, priceMax: 3200, tier: 'midrange', tags: ['chinese-brand', 'cushioned', 'long-distance'] },
  { id: '361-big3', brand: '361 Degrees', model: 'Big 3 4.0', category: 'stability', cushion: 'high', useCase: ['gym', 'running', 'daily_comfort'], priceMin: 1400, priceMax: 2600, tier: 'midrange', tags: ['chinese-brand', 'supportive', 'stable-base'] },
  { id: '361-runner', brand: '361 Degrees', model: 'Running Shoe', category: 'neutral', cushion: 'medium', useCase: ['running', 'walking'], priceMin: 900, priceMax: 1600, tier: 'budget', tags: ['chinese-brand', 'value', 'entry-level'] },
  { id: 'xtep-kunwu-lite-3', brand: 'Xtep', model: 'Kunwu Lite 3', category: 'neutral', cushion: 'high', useCase: ['running', 'daily_comfort'], priceMin: 2000, priceMax: 2800, tier: 'midrange', tags: ['chinese-brand', 'cushioned', 'training'] },
  { id: 'xtep-starlight-2', brand: 'Xtep', model: 'Starlight 2.0', category: 'neutral', cushion: 'medium', useCase: ['running', 'walking', 'daily_comfort'], priceMin: 2400, priceMax: 3200, tier: 'midrange', tags: ['chinese-brand', 'daily-trainer', 'lightweight'] },
  { id: 'lining-ultra-light', brand: 'Li-Ning', model: 'Ultra Light Runner', category: 'neutral', cushion: 'medium', useCase: ['running', 'walking', 'daily_comfort'], priceMin: 1800, priceMax: 3500, tier: 'midrange', tags: ['chinese-brand', 'lightweight', 'breathable'] },
  { id: 'lining-cloud', brand: 'Li-Ning', model: 'Cloud Running', category: 'max_cushion', cushion: 'high', useCase: ['running', 'daily_comfort', 'recovery'], priceMin: 2000, priceMax: 3800, tier: 'midrange', tags: ['chinese-brand', 'cushioned', 'cloud-foam'] },
  { id: 'peak-taichi', brand: 'Peak', model: 'Taichi Cushioning', category: 'max_cushion', cushion: 'high', useCase: ['running', 'daily_comfort', 'recovery'], priceMin: 1800, priceMax: 3500, tier: 'midrange', tags: ['chinese-brand', 'adaptive-cushion', 'taichi-foam'] },
  { id: 'peak-everyday', brand: 'Peak', model: 'Everyday Runner', category: 'neutral', cushion: 'medium', useCase: ['running', 'walking', 'gym'], priceMin: 1200, priceMax: 2200, tier: 'budget', tags: ['chinese-brand', 'value', 'everyday'] },
  { id: 'erke-cushion-runner', brand: 'Erke', model: 'Cushion Runner', category: 'neutral', cushion: 'medium', useCase: ['running', 'walking', 'daily_comfort'], priceMin: 900, priceMax: 2000, tier: 'budget', tags: ['chinese-brand', 'value', 'breathable'] },
  { id: 'kailas-fuga-trail', brand: 'Kailas', model: 'Fuga Trail', category: 'trail', cushion: 'medium', useCase: ['trail', 'running'], priceMin: 2500, priceMax: 4500, tier: 'midrange', tags: ['chinese-brand', 'trail', 'outdoor'] },
  { id: 'ozark-trail-shoe', brand: 'Ozark', model: 'Trail Hiking Shoe', category: 'trail', cushion: 'medium', useCase: ['trail', 'walking'], priceMin: 800, priceMax: 2200, tier: 'budget', tags: ['outdoor', 'hiking', 'value'] },
  { id: 'rake-lifestyle-runner', brand: 'RAKÉ', model: 'Lifestyle Runner', category: 'neutral', cushion: 'medium', useCase: ['running', 'walking', 'daily_comfort'], priceMin: 300, priceMax: 900, tier: 'budget', tags: ['ultra-budget', 'tiktok-viral', 'lifestyle'] },
  { id: 'sacnix-sport-runner', brand: 'Sacnix', model: 'Sport Running Sneakers', category: 'neutral', cushion: 'medium', useCase: ['running', 'walking', 'gym'], priceMin: 300, priceMax: 1000, tier: 'budget', tags: ['ultra-budget', 'shopee-find', 'value'] },
];
