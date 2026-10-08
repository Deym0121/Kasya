// Transforms src/data/raceSeed.json into an ingest payload (+ legacy JSONL) and
// prints the publish command. Usage: node scripts/seed-races.mjs
//
// Publish through /api/races/ingest: it replaces CURATED rows only and keeps
// community-approved races (convex/races.ts replaceAll). `npx convex import
// --table raceEvents --replace` wipes the WHOLE table, community races included.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRaceSeed } from './check-races-seed.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const seed = JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'raceSeed.json'), 'utf8'));
const problems = validateRaceSeed(seed);
if (problems.length) {
  console.error('Seed invalid — run npm run check:races');
  process.exit(1);
}
const now = Date.now();
const out = path.join(root, 'scripts', 'raceEvents.jsonl');
fs.writeFileSync(out, seed.events.map((e) => JSON.stringify({ ...e, updatedAt: now })).join('\n') + '\n');
const payload = path.join(root, 'scripts', 'raceEvents.ingest.json');
fs.writeFileSync(payload, JSON.stringify({ events: seed.events }));
console.log(`Wrote ${seed.events.length} rows to ${payload} (and ${out})`);
console.log('Publish (keeps community-approved races; RACES_INGEST_TOKEN from Convex env):');
console.log(
  '  curl -sS -X POST https://youthful-civet-99.convex.site/api/races/ingest ' +
    '-H "Authorization: Bearer $RACES_INGEST_TOKEN" -H "Content-Type: application/json" ' +
    '--data @scripts/raceEvents.ingest.json',
);
console.log('Do NOT use `npx convex import --replace` any more — it also deletes community-approved races.');
