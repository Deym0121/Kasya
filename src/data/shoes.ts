/** A shoe in the catalog. Facts only (no scraped/curated prose). */
export interface Shoe {
  id: string;
  brand: string;
  model: string;
  category: string; // neutral | stability | max_cushion | walking | trail | gym | recovery
  cushion: 'low' | 'medium' | 'high';
  useCase: string[]; // running | walking | gym | daily_comfort | recovery
  priceMin: number; // PHP
  priceMax: number;
  tags: string[];
  isOwnProduct?: boolean;
}

/**
 * Seed catalog for the demo. Real attributes come from a hand-curated DB + admin
 * CSV import later (re-plan). One own-product SKU is included and is always
 * transparently labeled in the UI (FTC).
 */
export const SHOES: Shoe[] = [
  {
    id: 'sf-support-runner',
    brand: 'StrideFit',
    model: 'Support Runner',
    category: 'stability',
    cushion: 'high',
    useCase: ['walking', 'running', 'daily_comfort'],
    priceMin: 1499,
    priceMax: 1499,
    tags: ['budget', 'high-cushion', 'beginner'],
    isOwnProduct: true,
  },
  {
    id: 'asics-gt-2000',
    brand: 'Asics',
    model: 'GT-2000',
    category: 'stability',
    cushion: 'high',
    useCase: ['running', 'daily_comfort'],
    priceMin: 6500,
    priceMax: 7500,
    tags: ['stability', 'daily-trainer'],
  },
  {
    id: 'brooks-ghost-17',
    brand: 'Brooks',
    model: 'Ghost 17',
    category: 'neutral',
    cushion: 'high',
    useCase: ['running', 'daily_comfort'],
    priceMin: 7000,
    priceMax: 8000,
    tags: ['neutral', 'smooth'],
  },
  {
    id: 'hoka-clifton-10',
    brand: 'Hoka',
    model: 'Clifton 10',
    category: 'max_cushion',
    cushion: 'high',
    useCase: ['running', 'recovery', 'daily_comfort'],
    priceMin: 8000,
    priceMax: 9000,
    tags: ['max-cushion', 'lightweight'],
  },
  {
    id: 'nike-pegasus-41',
    brand: 'Nike',
    model: 'Pegasus 41',
    category: 'neutral',
    cushion: 'medium',
    useCase: ['running', 'gym'],
    priceMin: 7500,
    priceMax: 8500,
    tags: ['versatile', 'responsive'],
  },
  {
    id: 'newbalance-880',
    brand: 'New Balance',
    model: 'Fresh Foam 880',
    category: 'neutral',
    cushion: 'high',
    useCase: ['walking', 'running', 'daily_comfort'],
    priceMin: 6800,
    priceMax: 7800,
    tags: ['wide-fit', 'durable'],
  },
  {
    id: 'skechers-gowalk',
    brand: 'Skechers',
    model: 'GoWalk 7',
    category: 'walking',
    cushion: 'medium',
    useCase: ['walking', 'daily_comfort'],
    priceMin: 3500,
    priceMax: 4500,
    tags: ['walking', 'slip-on'],
  },
  {
    id: 'adidas-supernova',
    brand: 'Adidas',
    model: 'Supernova Rise',
    category: 'stability',
    cushion: 'medium',
    useCase: ['running', 'daily_comfort'],
    priceMin: 6000,
    priceMax: 7000,
    tags: ['support', 'daily-trainer'],
  },
];
