import type { Shoe } from './shoes';

/**
 * What public reviews say about each shoe — researched 2026-07-06 across expert
 * reviews (RunRepeat etc.), runner communities and marketplace ratings, and
 * summarized as a consensus tone + one hedged phrase. Shown in the UI with a
 * "per public reviews" attribution — NEVER an invented lab score.
 *
 * Shoes with too little honest review signal (mostly generic ultra-budget
 * lines) are deliberately absent rather than guessed at.
 */
export const SHOE_QUALITY: Record<string, NonNullable<Shoe['quality']>> = {
  'asics-gel-nimbus-27': { tone: 'well_regarded', note: 'praised for plush comfort; some find it heavy for quicker days' },
  'asics-gel-kayano-32': { tone: 'well_regarded', note: 'praised for comfort, durability and a steady, supportive feel' },
  'asics-novablast-5': { tone: 'well_regarded', note: 'widely praised for bouncy cushioning and strong value' },
  'asics-gel-cumulus-27': { tone: 'solid', note: 'seen as a durable, comfortable daily trainer; runs a bit warm' },
  'nike-pegasus-41': { tone: 'solid', note: 'regarded as a reliable all-round daily trainer, if a bit heavy' },
  'nike-vomero-18': { tone: 'well_regarded', note: 'praised for plush comfort at a friendlier price; not a fast shoe' },
  'nike-infinityrn-4': { tone: 'solid', note: 'comfortable and durable, though heavy; said to run small' },
  'brooks-ghost-18': { tone: 'well_regarded', note: 'widely called a dependable, durable daily workhorse' },
  'brooks-glycerin-23': { tone: 'solid', note: 'praised for plush comfort and durability, if a bit heavy' },
  'brooks-adrenaline-gts-25': { tone: 'well_regarded', note: 'seen as a dependable, comfortable long-mile workhorse' },
  'hoka-clifton-10': { tone: 'solid', note: 'liked for soft everyday comfort; some note added weight' },
  'hoka-bondi-9': { tone: 'solid', note: 'reviewers find it plush for easy miles, though bulky and snug' },
  'hoka-arahi-7': { tone: 'solid', note: 'seen as a light, steady daily trainer; firmer, snugger fit' },
  'hoka-speedgoat-6': { tone: 'well_regarded', note: 'praised for trail grip and durability; a bit stiff at first' },
  'nb-1080v14': { tone: 'well_regarded', note: 'praised for plush comfort on easy miles; some find it a bit heavy' },
  'nb-880v14': { tone: 'solid', note: 'seen as a dependable, comfortable everyday trainer' },
  'nb-rebel-v4': { tone: 'well_regarded', note: 'widely praised as a light, bouncy, fun daily trainer at fair price' },
  'adidas-ultraboost-5': { tone: 'mixed', note: 'loved for comfort, style and durability; some call it heavy and pricey' },
  'adidas-supernova-rise': { tone: 'well_regarded', note: 'praised as a comfortable, durable daily trainer with strong value' },
  'adidas-adizero-sl-2': { tone: 'well_regarded', note: 'called a sleeper hit; lightweight, versatile and great value' },
  'saucony-triumph-23': { tone: 'well_regarded', note: 'praised as plush, comfy long-run cushioning' },
  'saucony-ride-18': { tone: 'well_regarded', note: 'widely called a durable, great-value do-it-all daily trainer' },
  'saucony-endorphin-speed-5': { tone: 'well_regarded', note: 'broadly praised as a bouncy, versatile trainer for faster days' },
  'skechers-gowalk-arch-fit': { tone: 'solid', note: 'liked for easy slip-on comfort on long walks' },
  'skechers-max-cushioning-elite': { tone: 'solid', note: 'praised for all-day soft comfort; fit runs narrow for some' },
  'skechers-gorun-ride-11': { tone: 'well_regarded', note: 'reviewers highlight the long-lasting outsole and strong value' },
  'puma-velocity-nitro-4': { tone: 'well_regarded', note: 'praised as a bouncy, great-value daily trainer' },
  'puma-deviate-nitro-3': { tone: 'solid', note: 'liked as an affordable plated tempo shoe; fit runs a bit snug' },
  'puma-magnify-nitro-2': { tone: 'solid', note: 'seen as a grippy, cushioned workhorse, if a touch heavy' },
  'mizuno-wave-rider-29': { tone: 'well_regarded', note: 'reviewers call it an excellent update; softer, lighter daily feel' },
  'mizuno-wave-inspire-22': { tone: 'solid', note: 'praised for steady comfort and a durable outsole' },
  'on-cloudmonster-2': { tone: 'solid', note: 'liked for roomy comfort and durability; some find it heavy and pricey' },
  'on-cloudsurfer-2': { tone: 'mixed', note: 'smooth for easy miles, though some reviewers find the ride firm' },
  'on-cloud-5': { tone: 'mixed', note: 'loved for light all-day walking comfort; less suited to running' },
  '361-spire-4': { tone: 'well_regarded', note: 'reviewers praise its durability, comfort and versatility' },
  '361-big3': { tone: 'solid', note: 'reviews call it responsive with good grip' },
  'peak-taichi': { tone: 'solid', note: 'reviewers often praise the plush, adaptive cushioning for the price' },
  'erke-cushion-runner': { tone: 'solid', note: 'marketplace reviews cite comfort and value; sizing feedback varies' },
  'kailas-fuga-trail': { tone: 'well_regarded', note: 'reviewers praise the grip and durability; fit noted as snug' },
  'ozark-trail-shoe': { tone: 'mixed', note: 'liked for the low price, though durability reports vary' },
};
