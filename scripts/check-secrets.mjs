#!/usr/bin/env node
// Guardrail: fail if a real secret — or a secret hidden behind an EXPO_PUBLIC_
// prefix (Expo inlines those into the shipped client bundle) — appears in tracked
// source. Scans only git-tracked code/config files (skips docs/markdown so their
// placeholder examples don't false-positive).
//
// Run:  npm run check:secrets   (wire into CI and/or a pre-commit hook)
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PATTERNS = [
  { name: 'OpenRouter key', re: /sk-or-v1-[a-f0-9]{16,}/i },
  { name: 'Anthropic key', re: /sk-ant-[a-z0-9-]{20,}/i },
  { name: 'OpenAI key', re: /sk-(?:proj-)?[A-Za-z0-9]{40,}/ },
  // A secret must never ship behind EXPO_PUBLIC_ (the anon key is fine; a
  // service_role / OpenRouter / private key is not).
  { name: 'secret behind EXPO_PUBLIC_', re: /EXPO_PUBLIC_[A-Z0-9_]*(?:SERVICE_ROLE|SECRET|PRIVATE_KEY|OPENROUTER)[A-Z0-9_]*\s*=/ },
];

const SCAN_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json)$/;
const SKIP = /(^|\/)(package-lock\.json)$|scripts\/check-secrets\.mjs$/;

const files = execSync('git ls-files', { encoding: 'utf8' })
  .split('\n')
  .map((s) => s.trim())
  .filter((f) => f && SCAN_EXT.test(f) && !SKIP.test(f));

let hits = 0;
for (const f of files) {
  let text;
  try {
    text = readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  for (const { name, re } of PATTERNS) {
    const m = text.match(re);
    if (m) {
      console.error(`✖ ${name} in ${f}: ${m[0].slice(0, 14)}…`);
      hits++;
    }
  }
}

if (hits) {
  console.error(`\n${hits} potential secret(s) in tracked source. Remove them, and rotate any exposed key.`);
  process.exit(1);
}
console.log(`✓ No committed secrets across ${files.length} tracked source files.`);
