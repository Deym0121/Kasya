// react-native-reanimated is deliberately removed (dual-worklets conflict), but
// two packages ship a lazy "ReanimatedProxy" that throws
// "react-native-reanimated is not installed!" the moment ANY property is touched:
//
//  - react-native-vision-camera 4.7.x — touched during the camera import chain
//    (App Review 2.1(a), build 24's on-screen "Camera engine note").
//  - @shopify/react-native-skia 2.6.x — vendors the same proxy AND touches it at
//    MODULE SCOPE: external/reanimated/useVideoLoading.ts:8 runs
//    Rea.createWorkletRuntime(...) during evaluation, which its src/index.ts
//    re-exports unconditionally (export * from "./external"). Importing skia at
//    all therefore threw on devices without reanimated — this was the thrower
//    that survived the vision-camera-only patch (still visible on build 24 +
//    OTA, 2026-08-26).
//
// Both packages declare "react-native": "src/..." so Metro bundles src/, NOT
// lib/ — the src flavor is the one every bundle (dev, EAS release, OTA export)
// actually uses; lib flavors are patched for parity.
//
// The stub is safe: we never render SkiaCameraCanvas, never use skia video /
// reanimated-driven skia hooks (HAS_REANIMATED_3 stays false via its own
// require check), so the proxies only need harmless no-ops instead of a throw.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUB = `{
    useSharedValue: (v) => ({ value: v }),
    useDerivedValue: (fn) => ({ value: typeof fn === 'function' ? undefined : fn }),
    useFrameCallback: () => {},
    useAnimatedReaction: () => {},
    useAnimatedStyle: () => ({}),
    createAnimatedComponent: (c) => c,
    runOnJS: (f) => f,
    runOnUI: (f) => f,
    createWorkletRuntime: () => ({}),
    runOnRuntime: (_rt, f) => f,
    makeMutable: (v) => ({ value: v }),
    startMapper: () => 0,
    stopMapper: () => {},
    isSharedValue: () => false,
  }`;
const MARKER = 'useFrameCallback: () => {}';
const THROW_RE = /throw new (?:_ModuleProxy\.)?OptionalDependencyNotInstalledError\(['"]react-native-reanimated['"]\);?/;

const TARGETS = [
  ['react-native-vision-camera', [
    ['src', path.join('src', 'dependencies', 'ReanimatedProxy.ts')],
    ['module', path.join('lib', 'module', 'dependencies', 'ReanimatedProxy.js')],
    ['commonjs', path.join('lib', 'commonjs', 'dependencies', 'ReanimatedProxy.js')],
  ]],
  ['@shopify/react-native-skia', [
    ['src', path.join('src', 'external', 'reanimated', 'ReanimatedProxy.ts')],
    ['module', path.join('lib', 'module', 'external', 'reanimated', 'ReanimatedProxy.js')],
    ['commonjs', path.join('lib', 'commonjs', 'external', 'reanimated', 'ReanimatedProxy.js')],
  ]],
];

for (const [pkg, flavors] of TARGETS) {
  let patched = 0;
  for (const [flavor, rel] of flavors) {
    const file = path.join(root, 'node_modules', pkg, rel);
    if (!fs.existsSync(file)) {
      console.error(`patch-reanimated-proxies: missing ${pkg} ${flavor} ReanimatedProxy — package layout changed, investigate`);
      process.exit(1);
    }
    const src = fs.readFileSync(file, 'utf8');
    if (src.includes(MARKER)) { patched++; continue; }
    if (!THROW_RE.test(src)) {
      console.error(`patch-reanimated-proxies: expected throw not found in ${pkg} ${flavor} — investigate`);
      process.exit(1);
    }
    fs.writeFileSync(file, src.replace(THROW_RE, 'return ' + STUB + ';'));
    patched++;
    console.log(`patch-reanimated-proxies: stubbed ${pkg} (${flavor})`);
  }
  console.log(`patch-reanimated-proxies: ${pkg} ok (${patched}/${flavors.length} flavors)`);
}
