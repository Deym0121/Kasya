import { describe, it, expect } from 'vitest';
import {
  GROUP_LIMITS,
  INVITE_ALPHABET,
  addDaysToKey,
  cleanGroupName,
  cleanStepDay,
  daysInRange,
  isDayKey,
  isValidRange,
  makeInviteCode,
  normalizeInviteCode,
  prepareStepDays,
  publicDisplayName,
  rankMembers,
  utcDayKey,
} from '../rules';

describe('invite codes', () => {
  it('uses only the unambiguous alphabet', () => {
    expect(INVITE_ALPHABET).not.toMatch(/[01ILO]/);
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 200; i++) {
      const code = makeInviteCode(rand);
      expect(code).toHaveLength(GROUP_LIMITS.codeLength);
      for (const ch of code) expect(INVITE_ALPHABET).toContain(ch);
    }
  });

  it('never indexes past the alphabet, even for random() ≈ 1', () => {
    expect(makeInviteCode(() => 0.9999999999)).toBe('ZZZZZZ');
    expect(makeInviteCode(() => 0)).toBe('222222');
  });

  it('normalizes what people type', () => {
    expect(normalizeInviteCode('k7m2qx')).toBe('K7M2QX');
    expect(normalizeInviteCode(' K7M-2QX ')).toBe('K7M2QX');
    expect(normalizeInviteCode('K7M 2QX')).toBe('K7M2QX');
  });

  it('rejects malformed codes', () => {
    expect(normalizeInviteCode('')).toBeNull();
    expect(normalizeInviteCode('K7M2Q')).toBeNull();
    expect(normalizeInviteCode('K7M2QXA')).toBeNull();
    expect(normalizeInviteCode('K7M2Q0')).toBeNull(); // zero isn't in the alphabet
    expect(normalizeInviteCode('K7M2QI')).toBeNull();
    expect(normalizeInviteCode('K7M2Q!')).toBeNull();
    expect(normalizeInviteCode(undefined as unknown as string)).toBeNull();
  });
});

describe('cleanGroupName', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanGroupName('  Sunday   Long Run  ')).toEqual({ ok: true, name: 'Sunday Long Run' });
    expect(cleanGroupName('Run\nClub\t')).toEqual({ ok: true, name: 'Run Club' });
  });

  it('enforces 2–40 characters', () => {
    expect(cleanGroupName('A').ok).toBe(false);
    expect(cleanGroupName('   ').ok).toBe(false);
    expect(cleanGroupName('AB')).toEqual({ ok: true, name: 'AB' });
    expect(cleanGroupName('x'.repeat(40)).ok).toBe(true);
    expect(cleanGroupName('x'.repeat(41)).ok).toBe(false);
  });
});

describe('publicDisplayName', () => {
  it('shows the first name only', () => {
    expect(publicDisplayName('Joshua Ladero', 'k17abc')).toBe('Joshua');
    expect(publicDisplayName('  Maria  ', 'k17abc')).toBe('Maria');
  });

  it('falls back to Runner + last 4 of the id', () => {
    expect(publicDisplayName(undefined, 'k17x9ab2')).toBe('Runner 9AB2');
    expect(publicDisplayName('', 'k17x9ab2')).toBe('Runner 9AB2');
    expect(publicDisplayName(42, 'k17x9ab2')).toBe('Runner 9AB2');
  });

  it('never exposes an email', () => {
    expect(publicDisplayName('someone@example.com', 'k17x9ab2')).toBe('Runner 9AB2');
    expect(publicDisplayName('me@x.io Smith', 'k17x9ab2')).toBe('Runner 9AB2');
  });

  it('caps very long names', () => {
    expect(publicDisplayName('A'.repeat(50), 'id')).toHaveLength(20);
  });
});

describe('day keys', () => {
  it('accepts only real YYYY-MM-DD days', () => {
    expect(isDayKey('2026-10-17')).toBe(true);
    expect(isDayKey('2028-02-29')).toBe(true);
    expect(isDayKey('2027-02-29')).toBe(false);
    expect(isDayKey('2026-13-01')).toBe(false);
    expect(isDayKey('2026-1-01')).toBe(false);
    expect(isDayKey('2026-10-17T00:00')).toBe(false);
    expect(isDayKey(20261017)).toBe(false);
  });

  it('does calendar math', () => {
    expect(addDaysToKey('2026-10-17', 1)).toBe('2026-10-18');
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysInRange('2026-10-12', '2026-10-18')).toBe(7);
    expect(daysInRange('2026-10-18', '2026-10-12')).toBe(0);
    expect(utcDayKey(Date.UTC(2026, 9, 17, 23, 59))).toBe('2026-10-17');
  });

  it('validates leaderboard ranges', () => {
    expect(isValidRange('2026-10-12', '2026-10-18')).toBe(true);
    expect(isValidRange('2026-10-01', '2026-10-31')).toBe(true);
    expect(isValidRange('2026-10-18', '2026-10-12')).toBe(false);
    expect(isValidRange('2026-01-01', '2026-12-31')).toBe(false); // too wide
    expect(isValidRange('2026-10-12', 'nope')).toBe(false);
  });
});

describe('step days', () => {
  it('rounds sane values', () => {
    expect(cleanStepDay({ day: '2026-10-17', steps: 8123.6, activeMin: 41.2, kcal: 312.7 })).toEqual({
      day: '2026-10-17',
      steps: 8124,
      activeMin: 41,
      kcal: 313,
    });
  });

  it('rejects out-of-range or malformed days', () => {
    const ok = { day: '2026-10-17', steps: 1000, activeMin: 10, kcal: 100 };
    expect(cleanStepDay({ ...ok, steps: -1 })).toBeNull();
    expect(cleanStepDay({ ...ok, steps: 150_001 })).toBeNull();
    expect(cleanStepDay({ ...ok, activeMin: 1441 })).toBeNull();
    expect(cleanStepDay({ ...ok, kcal: 20_001 })).toBeNull();
    expect(cleanStepDay({ ...ok, steps: NaN })).toBeNull();
    expect(cleanStepDay({ ...ok, day: '17/10/2026' })).toBeNull();
    expect(cleanStepDay(null)).toBeNull();
    expect(cleanStepDay({ ...ok, steps: 150_000, activeMin: 1440, kcal: 20_000 })).not.toBeNull();
  });

  it('prepares an upload: valid, one per day, sorted, most recent 62', () => {
    const days = [
      { day: '2026-10-17', steps: 100, activeMin: 1, kcal: 1 },
      { day: '2026-10-15', steps: 300, activeMin: 3, kcal: 3 },
      { day: 'bad', steps: 5, activeMin: 0, kcal: 0 },
      { day: '2026-10-17', steps: 200, activeMin: 2, kcal: 2 }, // later duplicate wins
    ];
    expect(prepareStepDays(days)).toEqual([
      { day: '2026-10-15', steps: 300, activeMin: 3, kcal: 3 },
      { day: '2026-10-17', steps: 200, activeMin: 2, kcal: 2 },
    ]);

    const many = Array.from({ length: 90 }, (_, i) => ({
      day: addDaysToKey('2026-07-01', i),
      steps: i,
      activeMin: 0,
      kcal: 0,
    }));
    const out = prepareStepDays(many);
    expect(out).toHaveLength(62);
    expect(out[0].day).toBe(addDaysToKey('2026-07-01', 28));
    expect(out[61].day).toBe(addDaysToKey('2026-07-01', 89));
    expect(prepareStepDays(undefined as never)).toEqual([]);
  });
});

describe('rankMembers', () => {
  it('ranks by steps, then active minutes, then who joined first', () => {
    const ranked = rankMembers([
      { userId: 'a', steps: 5000, activeMin: 30, joinedAt: 3 },
      { userId: 'b', steps: 9000, activeMin: 10, joinedAt: 2 },
      { userId: 'c', steps: 5000, activeMin: 45, joinedAt: 4 },
      { userId: 'd', steps: 5000, activeMin: 30, joinedAt: 1 },
      { userId: 'e', steps: 0, activeMin: 0, joinedAt: 0 },
    ]);
    expect(ranked.map((r) => [r.userId, r.rank])).toEqual([
      ['b', 1],
      ['c', 2],
      ['d', 3],
      ['a', 4],
      ['e', 5],
    ]);
  });

  it('keeps extra fields and does not mutate the input', () => {
    const input = [
      { userId: 'x', steps: 1, activeMin: 0, joinedAt: 0, name: 'X' },
      { userId: 'y', steps: 2, activeMin: 0, joinedAt: 0, name: 'Y' },
    ];
    const ranked = rankMembers(input);
    expect(ranked[0]).toEqual({ userId: 'y', steps: 2, activeMin: 0, joinedAt: 0, name: 'Y', rank: 1 });
    expect(input[0].userId).toBe('x');
  });
});
