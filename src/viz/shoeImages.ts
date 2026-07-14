/**
 * Bundled real product photos, keyed by catalog shoe id.
 *
 * Downloaded from each brand/retailer's official product page (dev-stage assets;
 * per-image source URLs live in assets/shoes/PROVENANCE.json — confirm/replace
 * with licensed affiliate-feed images before store launch). Only shoes with a
 * verified photo appear here; everything else keeps the honest brand glyph.
 *
 * Kept OUT of src/data/shoes.ts so the pure data module (and its node unit tests)
 * never touches Metro's image loader.
 */
export const SHOE_IMAGES: Record<string, number> = {
  '361-big3': require('../../assets/shoes/361-big3.webp'),
  '361-spire-4': require('../../assets/shoes/361-spire-4.jpg'),
  'adidas-adizero-sl-2': require('../../assets/shoes/adidas-adizero-sl-2.jpg'),
  'adidas-supernova-rise': require('../../assets/shoes/adidas-supernova-rise.webp'),
  'adidas-ultraboost-5': require('../../assets/shoes/adidas-ultraboost-5.jpg'),
  'asics-gel-cumulus-27': require('../../assets/shoes/asics-gel-cumulus-27.webp'),
  'asics-gel-kayano-32': require('../../assets/shoes/asics-gel-kayano-32.webp'),
  'asics-gel-nimbus-27': require('../../assets/shoes/asics-gel-nimbus-27.webp'),
  'asics-novablast-5': require('../../assets/shoes/asics-novablast-5.webp'),
  'brooks-adrenaline-gts-25': require('../../assets/shoes/brooks-adrenaline-gts-25.webp'),
  'brooks-ghost-18': require('../../assets/shoes/brooks-ghost-18.webp'),
  'brooks-glycerin-23': require('../../assets/shoes/brooks-glycerin-23.webp'),
  'hoka-arahi-7': require('../../assets/shoes/hoka-arahi-7.webp'),
  'hoka-bondi-9': require('../../assets/shoes/hoka-bondi-9.webp'),
  'hoka-clifton-10': require('../../assets/shoes/hoka-clifton-10.webp'),
  'hoka-speedgoat-6': require('../../assets/shoes/hoka-speedgoat-6.webp'),
  'kailas-fuga-trail': require('../../assets/shoes/kailas-fuga-trail.webp'),
  'mizuno-wave-inspire-22': require('../../assets/shoes/mizuno-wave-inspire-22.webp'),
  'mizuno-wave-rider-29': require('../../assets/shoes/mizuno-wave-rider-29.webp'),
  'nb-1080v14': require('../../assets/shoes/nb-1080v14.webp'),
  'nb-880v14': require('../../assets/shoes/nb-880v14.webp'),
  'nb-rebel-v4': require('../../assets/shoes/nb-rebel-v4.webp'),
  'nike-infinityrn-4': require('../../assets/shoes/nike-infinityrn-4.webp'),
  'nike-pegasus-41': require('../../assets/shoes/nike-pegasus-41.webp'),
  'nike-vomero-18': require('../../assets/shoes/nike-vomero-18.webp'),
  'on-cloud-5': require('../../assets/shoes/on-cloud-5.webp'),
  'on-cloudmonster-2': require('../../assets/shoes/on-cloudmonster-2.webp'),
  'on-cloudsurfer-2': require('../../assets/shoes/on-cloudsurfer-2.webp'),
  'peak-taichi': require('../../assets/shoes/peak-taichi.webp'),
  'puma-deviate-nitro-3': require('../../assets/shoes/puma-deviate-nitro-3.webp'),
  'puma-magnify-nitro-2': require('../../assets/shoes/puma-magnify-nitro-2.webp'),
  'puma-velocity-nitro-4': require('../../assets/shoes/puma-velocity-nitro-4.webp'),
  'saucony-endorphin-speed-5': require('../../assets/shoes/saucony-endorphin-speed-5.jpg'),
  'saucony-ride-18': require('../../assets/shoes/saucony-ride-18.jpg'),
  'saucony-triumph-23': require('../../assets/shoes/saucony-triumph-23.jpg'),
  'skechers-gorun-ride-11': require('../../assets/shoes/skechers-gorun-ride-11.webp'),
  'skechers-gowalk-arch-fit': require('../../assets/shoes/skechers-gowalk-arch-fit.webp'),
  'skechers-max-cushioning-elite': require('../../assets/shoes/skechers-max-cushioning-elite.webp'),
  'worldbalance-oneup': require('../../assets/shoes/worldbalance-oneup.webp'),
  'worldbalance-walker': require('../../assets/shoes/worldbalance-walker.webp'),
  'xtep-kunwu-lite-3': require('../../assets/shoes/xtep-kunwu-lite-3.webp'),
  'xtep-starlight-2': require('../../assets/shoes/xtep-starlight-2.webp'),
};
