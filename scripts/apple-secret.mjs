#!/usr/bin/env node
// Generate the Supabase "Secret Key" for the Apple provider.
//
// Apple's OAuth secret is not a copy-paste value — it's an ES256 JWT you sign
// with the .p8 key from developer.apple.com. Run this LOCALLY (the key never
// leaves your machine) and paste the printed token into Supabase → Auth →
// Providers → Apple → Secret Key.
//
// Usage:
//   node scripts/apple-secret.mjs <path-to-AuthKey_XXXX.p8> <TEAM_ID> <KEY_ID> <SERVICES_ID>
// Example:
//   node scripts/apple-secret.mjs ./AuthKey_AB12CD34EF.p8 1A2BC3D4E5 AB12CD34EF com.kasya.web
//
// ⚠ Apple caps the token at 6 months — this script uses the maximum. Put the
//   printed expiry date in your calendar and re-run before it lapses, or Apple
//   sign-in silently stops working.
import { readFileSync } from 'node:fs';
import { createPrivateKey, sign } from 'node:crypto';

const [p8Path, teamId, keyId, servicesId] = process.argv.slice(2);
if (!p8Path || !teamId || !keyId || !servicesId) {
  console.error('Usage: node scripts/apple-secret.mjs <AuthKey.p8> <TEAM_ID> <KEY_ID> <SERVICES_ID>');
  process.exit(1);
}

const b64url = (input) => Buffer.from(input).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const exp = now + 180 * 24 * 60 * 60; // Apple's maximum: 6 months

const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
const payload = b64url(
  JSON.stringify({ iss: teamId, iat: now, exp, aud: 'https://appleid.apple.com', sub: servicesId }),
);
const signingInput = `${header}.${payload}`;

const key = createPrivateKey(readFileSync(p8Path, 'utf8'));
const signature = sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' });

console.log('\nYour Apple Secret Key (paste into Supabase → Auth → Providers → Apple):\n');
console.log(`${signingInput}.${b64url(signature)}`);
console.log(`\n⚠ Expires ${new Date(exp * 1000).toDateString()} — calendar a re-run before then.`);
