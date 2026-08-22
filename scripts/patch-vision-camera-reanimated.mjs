// vision-camera's ReanimatedProxy throws "react-native-reanimated is not
// installed!" as soon as any property is touched. Importing ANYTHING from
// react-native-vision-camera evaluates its skia exports, whose chain touches
// the proxy — so on devices without reanimated (removed deliberately; the
// dual-worklets conflict) the whole camera import throws and the app falls
// back to the simulated scan (seen on TestFlight build 24).
// We never render SkiaCameraCanvas, so the proxy gets harmless no-ops instead
// of a throw. Scoped to vision-camera only: skia and react-native-screens keep
// seeing reanimated as absent (their optional integrations stay off).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUB = `{
    useSharedValue: (v) => ({ value: v }),
    useFrameCallback: () => {},
    useDerivedValue: (fn) => ({ value: typeof fn === 'function' ? undefined : fn }),
    createAnimatedComponent: (c) => c,
    runOnJS: (f) => f,
    runOnUI: (f) => f,
  }`;
let patched = 0;
for (const flavor of ['module', 'commonjs']) {
  const file = path.join(root, 'node_modules', 'react-native-vision-camera', 'lib', flavor, 'dependencies', 'ReanimatedProxy.js');
  if (!fs.existsSync(file)) {
    console.error('patch-vision-camera: missing ' + flavor + ' ReanimatedProxy — package layout changed, investigate');
    process.exit(1);
  }
  const src = fs.readFileSync(file, 'utf8');
  if (src.includes('useFrameCallback: () => {}')) { patched++; continue; }
  const THROW_RE = /throw new (?:_ModuleProxy\.)?OptionalDependencyNotInstalledError\(['"]react-native-reanimated['"]\);/;
  if (!THROW_RE.test(src)) {
    console.error('patch-vision-camera: expected throw not found in ' + flavor + ' — investigate');
    process.exit(1);
  }
  fs.writeFileSync(file, src.replace(THROW_RE, 'return ' + STUB + ';'));
  patched++;
  console.log('patch-vision-camera: stubbed ReanimatedProxy (' + flavor + ')');
}
console.log('patch-vision-camera: done (' + patched + '/2 flavors ok)');
