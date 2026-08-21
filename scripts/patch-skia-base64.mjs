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
