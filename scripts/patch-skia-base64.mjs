// EAS lifecycle hook (eas-build-post-install): react-native-skia 2.6.2's
// cpp/api/third_party sources include their OWN headers with a "third_party/"
// prefix (e.g. base64.cpp -> #include "third_party/base64.h"), which only
// resolves when cpp/api happens to be on HEADER_SEARCH_PATHS — not true on
// EAS once expo-updates changed the pod graph. Build #13/#14 died on base64.h,
// build #16 on SkottieUtils.h. This rewrites EVERY such include in that dir to
// the bare filename, which resolves via the including file's own directory on
// any toolchain. Idempotent; verifies nothing is left; loud on layout changes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'node_modules', '@shopify', 'react-native-skia', 'cpp', 'api', 'third_party');
if (!fs.existsSync(dir)) {
  console.error('patch-skia: third_party dir not found — skia layout changed, investigate before building');
  process.exit(1);
}
let patched = 0;
for (const name of fs.readdirSync(dir)) {
  const file = path.join(dir, name);
  if (!fs.statSync(file).isFile()) continue;
  const src = fs.readFileSync(file, 'utf8');
  const out = src.replace(/#include "third_party\/([^"]+)"/g, '#include "$1"');
  if (out !== src) {
    fs.writeFileSync(file, out);
    patched++;
    console.log('patch-skia: fixed self-include in', name);
  }
}
const leftovers = fs.readdirSync(dir).filter((n) => {
  const f = path.join(dir, n);
  return fs.statSync(f).isFile() && fs.readFileSync(f, 'utf8').includes('#include "third_party/');
});
if (leftovers.length) {
  console.error('patch-skia: unpatched includes remain in', leftovers.join(', '));
  process.exit(1);
}
console.log('patch-skia: done (' + patched + ' patched this run, dir verified clean)');

// Part 2 (build #17): the podspec's recursive glob '"$(PODS_TARGET_SRCROOT)/cpp/"/**'
// does not expand on EAS (SDK headers like include/core/SkImage.h unresolved),
// while the podspec's EXPLICIT dirs provably reach the compiler. Replace the
// broken glob with an explicit list of every needed search root.
const podspec = path.join(root, 'node_modules', '@shopify', 'react-native-skia', 'react-native-skia.podspec');
if (!fs.existsSync(podspec)) {
  console.error('patch-skia: podspec not found — layout changed, investigate');
  process.exit(1);
}
const GLOB = '"$(PODS_TARGET_SRCROOT)/cpp/"/**';
const EXPLICIT = ['cpp/api', 'cpp/api/third_party', 'cpp/skia', 'cpp/jsi', 'cpp/rnskia', 'cpp/utils']
  .map((d) => '"$(PODS_TARGET_SRCROOT)/' + d + '"')
  .join(' ');
let spec = fs.readFileSync(podspec, 'utf8');
if (spec.includes(GLOB)) {
  spec = spec.replace(GLOB, EXPLICIT);
  fs.writeFileSync(podspec, spec);
  console.log('patch-skia: podspec glob replaced with explicit search roots');
} else if (spec.includes('$(PODS_TARGET_SRCROOT)/cpp/skia')) {
  console.log('patch-skia: podspec already patched');
} else {
  console.error('patch-skia: podspec glob not found and not patched — layout changed, investigate');
  process.exit(1);
}
