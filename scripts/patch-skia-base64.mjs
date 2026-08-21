// EAS lifecycle hook (eas-build-post-install): fixes react-native-skia 2.6.2's
// self-broken include. cpp/api/third_party/base64.cpp does
//   #include "third_party/base64.h"
// but the file SITS IN third_party/, so the quoted include only resolves when
// cpp/api happens to be on HEADER_SEARCH_PATHS — which stopped being true on
// EAS once expo-updates changed the pod graph (builds #13/#14,
// "'third_party/base64.h' file not found"). Rewriting it to "base64.h" resolves
// via the including file's own directory — always, on every toolchain.
// Idempotent; loud on unexpected content so a skia upgrade can't silently skip it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'node_modules', '@shopify', 'react-native-skia', 'cpp', 'api', 'third_party', 'base64.cpp');
if (!fs.existsSync(file)) {
  console.error('patch-skia-base64: base64.cpp not found — skia layout changed, investigate before building');
  process.exit(1);
}
const src = fs.readFileSync(file, 'utf8');
if (src.includes('#include "base64.h"')) {
  console.log('patch-skia-base64: already patched');
} else if (src.includes('#include "third_party/base64.h"')) {
  fs.writeFileSync(file, src.replace('#include "third_party/base64.h"', '#include "base64.h"'));
  console.log('patch-skia-base64: patched include in base64.cpp');
} else {
  console.error('patch-skia-base64: expected include not found — skia changed, investigate');
  process.exit(1);
}
