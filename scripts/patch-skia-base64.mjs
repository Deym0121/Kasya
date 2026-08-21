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

// Part 3 (build #18): the podspec patch does NOT reach the compiler (EAS's
// precompiled-pods pipeline supplies its own build settings) — but source-file
// patches always do. So rewrite skia-SDK includes ("include/...", "modules/...",
// "src/...") in the two locations that die on them (cpp/api/third_party and
// apple/) to RELATIVE paths against cpp/skia — resolvable with zero search
// paths. Every rewritten target is verified to exist on disk.
const skiaRoot = path.join(root, 'node_modules', '@shopify', 'react-native-skia');
function rewriteSdkIncludes(dirRel, relPrefix) {
  const dirAbs = path.join(skiaRoot, dirRel);
  if (!fs.existsSync(dirAbs)) return;
  for (const name of fs.readdirSync(dirAbs)) {
    const file = path.join(dirAbs, name);
    if (!fs.statSync(file).isFile() || !/\.(h|hpp|cpp|mm)$/.test(name)) continue;
    const src = fs.readFileSync(file, 'utf8');
    let bad = false;
    const out = src.replace(/#include "((?:include|modules|src)\/[^"]+)"/g, (m, inc) => {
      const target = path.join(skiaRoot, 'cpp', 'skia', inc);
      if (!fs.existsSync(target)) { bad = true; return m; }
      return '#include "' + relPrefix + '/' + inc + '"';
    });
    if (bad) {
      console.error('patch-skia: an SDK include in ' + dirRel + '/' + name + ' has no target under cpp/skia — investigate');
      process.exit(1);
    }
    if (out !== src) {
      fs.writeFileSync(file, out);
      console.log('patch-skia: relativized SDK includes in', dirRel + '/' + name);
    }
  }
}
rewriteSdkIncludes('cpp/api/third_party', '../../skia');
rewriteSdkIncludes('apple', '../cpp/skia');
console.log('patch-skia: SDK-include pass done');

// Part 4 (build #19): the relativized entry-includes worked — the compiler got
// INTO cpp/skia SDK headers, which then include each other with the same
// root-relative style ("include/core/SkTypes.h") that needs cpp/skia on a
// search path no delivery mechanism reaches. Final move: relativize EVERY
// SDK-prefix include across the whole package (cpp/ and apple/), computed per
// file. A rewrite happens only when the target exists under cpp/skia;
// unresolvable ones (platform-conditional code) are left untouched and counted.
const sdkBase = path.join(skiaRoot, 'cpp', 'skia');
let rewrote = 0, left = 0, filesTouched = 0;
function relativizeTree(dirAbs) {
  for (const name of fs.readdirSync(dirAbs)) {
    const f = path.join(dirAbs, name);
    const st = fs.statSync(f);
    if (st.isDirectory()) { relativizeTree(f); continue; }
    if (!/\.(h|hpp|cpp|mm)$/.test(name)) continue;
    const src = fs.readFileSync(f, 'utf8');
    const out = src.replace(/#include "((?:include|modules|src)\/[^"]+)"/g, (m, inc) => {
      const target = path.join(sdkBase, inc);
      if (!fs.existsSync(target)) { left++; return m; }
      let rel = path.relative(path.dirname(f), target).split(path.sep).join('/');
      if (!rel.startsWith('.')) rel = './' + rel;
      rewrote++;
      return '#include "' + rel + '"';
    });
    if (out !== src) { fs.writeFileSync(f, out); filesTouched++; }
  }
}
relativizeTree(path.join(skiaRoot, 'cpp'));
relativizeTree(path.join(skiaRoot, 'apple'));
console.log('patch-skia: relativized ' + rewrote + ' includes across ' + filesTouched + ' files (' + left + ' conditional includes left as-is)');

// Part 5 (build #20): one straggler form — Objective-C '#import <include/...>'
// (angle brackets) and '#import "include/..."' escaped the part-4 regex, which
// only matched '#include "..."'. Same treatment, all four spellings.
let rewrote2 = 0, left2 = 0, filesTouched2 = 0;
function relativizeAllForms(dirAbs) {
  for (const name of fs.readdirSync(dirAbs)) {
    const f = path.join(dirAbs, name);
    const st = fs.statSync(f);
    if (st.isDirectory()) { relativizeAllForms(f); continue; }
    if (!/\.(h|hpp|cpp|mm)$/.test(name)) continue;
    const src = fs.readFileSync(f, 'utf8');
    const out = src.replace(/#(import|include) ["<]((?:include|modules|src)\/[^">]+)[">]/g, (m, kw, inc) => {
      const target = path.join(sdkBase, inc);
      if (!fs.existsSync(target)) { left2++; return m; }
      let rel = path.relative(path.dirname(f), target).split(path.sep).join('/');
      if (!rel.startsWith('.')) rel = './' + rel;
      rewrote2++;
      return '#' + kw + ' "' + rel + '"';
    });
    if (out !== src) { fs.writeFileSync(f, out); filesTouched2++; }
  }
}
relativizeAllForms(path.join(skiaRoot, 'cpp'));
relativizeAllForms(path.join(skiaRoot, 'apple'));
console.log('patch-skia: all-forms pass rewrote ' + rewrote2 + ' in ' + filesTouched2 + ' files (' + left2 + ' left)');

// Part 6 (build #21): cross-directory quoted includes ("third_party/base64.h"
// from cpp/jsi, "jsi2/JSIConverter.h" from rnwgpu, etc.) — the last include
// family that depends on search paths. General resolver: any quoted subpath
// include that doesn't resolve against its own directory but resolves against
// a known package root gets rewritten relative. webgpu/dawn includes resolve
// against cpp/dawn/include which only exists after EAS's postinstall download
// and provably works via the original podspec entry — the exists-guard leaves
// them alone locally and on EAS alike if absent.
const ROOTS = ['cpp', 'cpp/api', 'cpp/api/third_party', 'cpp/jsi', 'cpp/jsi2', 'cpp/rnskia', 'cpp/utils', 'cpp/rnwgpu', 'cpp/rnwgpu/api', 'cpp/rnwgpu/async', 'cpp/dawn/include']
  .map((r) => path.join(skiaRoot, r));
let rewrote3 = 0, files3 = 0;
function crossDirPass(dirAbs) {
  for (const name of fs.readdirSync(dirAbs)) {
    const f = path.join(dirAbs, name);
    const st = fs.statSync(f);
    if (st.isDirectory()) { crossDirPass(f); continue; }
    if (!/\.(h|hpp|cpp|mm)$/.test(name)) continue;
    const src = fs.readFileSync(f, 'utf8');
    const out = src.replace(/#(import|include) "([^"]+)"/g, (m, kw, inc) => {
      if (!inc.includes('/') || inc.startsWith('.')) return m;
      if (fs.existsSync(path.join(path.dirname(f), inc))) return m;
      const root = ROOTS.find((r) => fs.existsSync(path.join(r, inc)));
      if (!root) return m;
      let rel = path.relative(path.dirname(f), path.join(root, inc)).split(path.sep).join('/');
      if (!rel.startsWith('.')) rel = './' + rel;
      rewrote3++;
      return '#' + kw + ' "' + rel + '"';
    });
    if (out !== src) { fs.writeFileSync(f, out); files3++; }
  }
}
crossDirPass(path.join(skiaRoot, 'cpp'));
crossDirPass(path.join(skiaRoot, 'apple'));
console.log('patch-skia: cross-dir pass rewrote ' + rewrote3 + ' includes in ' + files3 + ' files');
