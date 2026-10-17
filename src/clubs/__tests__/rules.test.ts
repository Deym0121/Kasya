import { describe, expect, it } from 'vitest';
import {
  CLUB_LIMITS,
  NO_PACE,
  addMonths,
  cleanClubName,
  cleanClubText,
  cleanGoalKm,
  cleanRunDay,
  compactCount,
  clubPaceKey,
  emblemKey,
  formatKm,
  formatPace,
  isBlockedText,
  isMonthKey,
  isServableMonth,
  metricValue,
  paceSecPerKm,
  parseEmblem,
  rankMembersBy,
} from '../rules';
import { COUNTRIES, flagEmoji, guessCountry, isCountryCode } from '../countries';
import { cleanStepDay } from '../../groups/rules';

describe('club text', () => {
  it('blocks obvious slurs and profanity in English and Filipino', () => {
    for (const bad of ['Tangina Runners', 'PUTANGINA club', 'gago squad', 'Run F u c k', 'n1gger', 'bobo runners']) {
      expect(isBlockedText(bad), bad).toBe(true);
    }
  });
  it('does not block place names that contain short bad words', () => {
    for (const ok of ['Batangas Runners', 'Reputation Run Club', 'Computation Pacers', 'Essex Harriers', 'Chicago Milers']) {
      expect(isBlockedText(ok), ok).toBe(false);
    }
  });
  it('cleans names and optional text', () => {
    expect(cleanClubName('  BGC   Run Club ')).toEqual({ ok: true, value: 'BGC Run Club' });
    expect(cleanClubName('x').ok).toBe(false);
    expect(cleanClubName('Ulol Pacers').ok).toBe(false);
    expect(cleanClubText('', 40, 'city')).toEqual({ ok: true, value: '' });
    expect(cleanClubText('a'.repeat(41), 40, 'city').ok).toBe(false);
  });
  it('reads goals', () => {
    expect(cleanGoalKm('1000')).toBe(1000);
    expect(cleanGoalKm(0)).toBeNull();
    expect(cleanGoalKm('abc')).toBeNull();
    expect(cleanGoalKm(1e9)).toBe(CLUB_LIMITS.goalKmMax);
  });
});

describe('emblems', () => {
  it('round-trips only known icons and colors', () => {
    expect(parseEmblem(emblemKey({ icon: 'fire', color: '#FFA24C' }))).toEqual({ icon: 'fire', color: '#FFA24C' });
    expect(parseEmblem('rocket|#FFA24C')).toBeNull();
    expect(parseEmblem('fire|#123456')).toBeNull();
    expect(parseEmblem(undefined)).toBeNull();
  });
});

describe('months', () => {
  it('validates and shifts month keys', () => {
    expect(isMonthKey('2026-10')).toBe(true);
    expect(isMonthKey('2026-13')).toBe(false);
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    const now = Date.UTC(2026, 9, 17);
    expect(isServableMonth('2026-11', now)).toBe(true);
    expect(isServableMonth('2026-12', now)).toBe(false);
    expect(isServableMonth('2024-09', now)).toBe(false);
  });
});

describe('runs and pace', () => {
  it('keeps plausible run days and drops the rest', () => {
    expect(cleanRunDay(10_000, 3_300)).toEqual({ runM: 10_000, runSec: 3_300 });
    expect(cleanRunDay(10_000, 600)).toEqual({ runM: 0, runSec: 0 }); // 1:00 /km
    expect(cleanRunDay(1_000, 1_500)).toEqual({ runM: 0, runSec: 0 }); // 25:00 /km
    expect(cleanRunDay(5_000, undefined)).toEqual({ runM: 0, runSec: 0 });
    expect(cleanRunDay(NaN, 100)).toEqual({ runM: 0, runSec: 0 });
  });
  it('carries run fields through cleanStepDay only when plausible', () => {
    const base = { day: '2026-10-17', steps: 9000, activeMin: 40, kcal: 380 };
    expect(cleanStepDay({ ...base, runM: 5000.4, runSec: 1800.2 })).toEqual({ ...base, runM: 5000, runSec: 1800 });
    expect(cleanStepDay({ ...base, runM: 5000, runSec: 100 })).toEqual(base);
    expect(cleanStepDay(base)).toEqual(base);
  });
  it('formats pace and distance', () => {
    expect(paceSecPerKm(10_000, 3_420)).toBe(342);
    expect(paceSecPerKm(0, 100)).toBeNull();
    expect(formatPace(342)).toBe('5:42');
    expect(formatPace(null)).toBe('—');
    expect(formatPace(NO_PACE)).toBe('—');
    expect(formatKm(42_195)).toBe('42.2');
    expect(formatKm(1_234_567)).toBe('1,235');
    expect(metricValue('steps', { steps: 12345, runM: 0, runSec: 0 })).toBe('12,345');
    expect(metricValue('steps', { steps: 3_412_000, runM: 0, runSec: 0 }, true)).toBe('3.41M');
    expect(compactCount(512_400)).toBe('512K');
    expect(compactCount(15_200_000)).toBe('15.2M');
    expect(compactCount(98_765)).toBe('98,765');
  });
  it('ranks a club on pace only after 20 km', () => {
    expect(clubPaceKey(19_999, 6_000)).toBe(NO_PACE);
    expect(clubPaceKey(20_000, 6_000)).toBe(300);
  });
});

describe('member ranking by metric', () => {
  const rows = [
    { userId: 'a', steps: 50_000, activeMin: 300, runM: 2_000, runSec: 700, joinedAt: 1 },
    { userId: 'b', steps: 30_000, activeMin: 200, runM: 30_000, runSec: 9_900, joinedAt: 2 },
    { userId: 'c', steps: 40_000, activeMin: 250, runM: 12_000, runSec: 3_600, joinedAt: 3 },
    { userId: 'd', steps: 40_000, activeMin: 250, runM: 0, runSec: 0, joinedAt: 4 },
  ];
  it('ranks by steps with ties on join order', () => {
    expect(rankMembersBy(rows, 'steps').map((r) => [r.userId, r.rank])).toEqual([
      ['a', 1],
      ['c', 2],
      ['d', 3],
      ['b', 4],
    ]);
  });
  it('ranks by run distance', () => {
    expect(rankMembersBy(rows, 'distance').map((r) => r.userId)).toEqual(['b', 'c', 'a', 'd']);
  });
  it('ranks pace among members with 5 km+, the rest unranked by distance', () => {
    expect(rankMembersBy(rows, 'pace').map((r) => [r.userId, r.rank])).toEqual([
      ['c', 1], // 5:00
      ['b', 2], // 5:30
      ['a', null], // only 2 km
      ['d', null],
    ]);
  });
});

describe('countries', () => {
  it('has unique ISO codes including the Philippines', () => {
    const codes = COUNTRIES.map(([c]) => c);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((c) => /^[A-Z]{2}$/.test(c))).toBe(true);
    expect(isCountryCode('PH')).toBe(true);
    expect(isCountryCode('ZZ')).toBe(false);
  });
  it('makes flags and guesses the runner’s country', () => {
    expect(flagEmoji('PH')).toBe('🇵🇭');
    expect(guessCountry('Asia/Manila', 'en-US')).toBe('PH');
    expect(guessCountry('Europe/Zurich', 'de-CH')).toBe('CH');
    expect(guessCountry(null, 'en')).toBe('PH');
  });
});
