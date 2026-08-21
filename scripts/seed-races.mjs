// Transforms src/data/raceSeed.json into JSONL and prints the import command.
// Usage: node scripts/seed-races.mjs   (then run the printed command)
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
console.log(`Wrote ${seed.events.length} rows to ${out}`);
console.log('Now run:');
console.log('  npx convex import --table raceEvents --replace --format jsonLines scripts/raceEvents.jsonl -y');
