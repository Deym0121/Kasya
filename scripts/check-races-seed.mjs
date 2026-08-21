// Validates src/data/raceSeed.json. Run: npm run check:races
// Exported so the vitest suite runs the same checks on the bundled seed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const COUNTRIES = ['PH', 'SG', 'MY', 'TH', 'ID', 'VN', 'HK', 'US', 'GB', 'DE', 'JP'];
const DISTANCES = ['5K', '10K', '21K', '42K', 'Ultra', 'Other'];
const URL_FIELDS = ['regUrl', 'officialUrl', 'resultsUrl', 'photosUrl', 'sourceUrl'];

export function validateRaceSeed(json) {
  const problems = [];
  const events = json && json.events;
  if (!Array.isArray(events) || events.length === 0) return ['events must be a non-empty array'];
  const ids = new Set();
  for (const e of events) {
    const tag = e && e.id ? e.id : JSON.stringify(e).slice(0, 40);
    if (!e || typeof e !== 'object') { problems.push(`${tag}: not an object`); continue; }
    if (typeof e.id !== 'string' || !/^[a-z0-9-]+$/.test(e.id)) problems.push(`${tag}: bad id`);
    if (ids.has(e.id)) problems.push(`${tag}: duplicate id`);
    ids.add(e.id);
    if (typeof e.name !== 'string' || !e.name.trim()) problems.push(`${tag}: missing name`);
    if (!COUNTRIES.includes(e.country)) problems.push(`${tag}: unsupported country ${e.country}`);
    if (typeof e.city !== 'string' || !e.city.trim()) problems.push(`${tag}: missing city`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.dateStart) || Number.isNaN(Date.parse(e.dateStart))) {
      problems.push(`${tag}: dateStart must be a valid YYYY-MM-DD`);
    }
    if (!Array.isArray(e.distances) || e.distances.length === 0 || e.distances.some((d) => !DISTANCES.includes(d))) {
      problems.push(`${tag}: distances must be a non-empty subset of ${DISTANCES.join('/')}`);
    }
    if (typeof e.major !== 'boolean') problems.push(`${tag}: major must be boolean`);
    for (const f of URL_FIELDS) {
      if (e[f] !== undefined && !/^https:\/\/\S+$/.test(e[f])) problems.push(`${tag}: ${f} must be https`);
    }
    if (e.sourceUrl === undefined) problems.push(`${tag}: sourceUrl (provenance) is required`);
  }
  return problems;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'raceSeed.json');
  const problems = validateRaceSeed(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (problems.length) {
    console.error(`✗ raceSeed.json: ${problems.length} problem(s):`);
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }
  console.log('✓ raceSeed.json valid');
}
