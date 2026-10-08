/**
 * Race-calendar types. Pure TS — no React Native imports, so the logic and
 * seed validation run in node (vitest, scripts).
 */

/** Countries the calendar covers. 'majors' is a virtual filter, not a country. */
export type RaceCountryCode = 'PH' | 'SG' | 'MY' | 'TH' | 'ID' | 'VN' | 'HK' | 'US' | 'GB' | 'DE' | 'JP';

export interface RaceCountry {
  code: RaceCountryCode;
  name: string;
  flag: string;
}

/** Display metadata; order here is the chip order for real countries. */
export const COUNTRIES: RaceCountry[] = [
  { code: 'PH', name: 'Philippines', flag: '🇵🇭' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾' },
  { code: 'TH', name: 'Thailand', flag: '🇹🇭' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩' },
  { code: 'VN', name: 'Vietnam', flag: '🇻🇳' },
  { code: 'HK', name: 'Hong Kong', flag: '🇭🇰' },
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵' },
];

export type RaceDistance = '5K' | '10K' | '21K' | '42K' | 'Ultra' | 'Other';

/** The distance whitelist, in display order (mirrors scripts/check-races-seed.mjs). */
export const DISTANCES: RaceDistance[] = ['5K', '10K', '21K', '42K', 'Ultra', 'Other'];

/**
 * Where a calendar row came from: 'curated' = the weekly refresh routine /
 * seed import; 'community' = a Kasya Pro runner's submission approved by the
 * Kasya team (never deleted by the weekly refresh). Absent on older rows,
 * which are curated.
 */
export type RaceEventSource = 'curated' | 'community';

export interface RaceEvent {
  /** stable slug id, e.g. 'manila-marathon-2027' */
  id: string;
  name: string;
  country: RaceCountryCode;
  city: string;
  /** ISO local race date: YYYY-MM-DD */
  dateStart: string;
  /** last day of a multi-day event (YYYY-MM-DD), when it has one */
  dateEnd?: string;
  distances: RaceDistance[];
  /** true only for the six World Marathon Majors */
  major: boolean;
  regUrl?: string;
  officialUrl?: string;
  resultsUrl?: string;
  photosUrl?: string;
  organizer?: string;
  /** provenance — the official page the entry was verified against */
  sourceUrl: string;
  source?: RaceEventSource;
}

/** Chip filters: every country + the Majors virtual filter + All. */
export type CountryFilter = 'all' | 'majors' | RaceCountryCode;
export const MAJORS_FILTER: CountryFilter = 'majors';

export function countryFor(code: RaceCountryCode): RaceCountry {
  return COUNTRIES.find((c) => c.code === code) ?? { code, name: code, flag: '🏳️' };
}
