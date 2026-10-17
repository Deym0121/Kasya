import { describe, it, expect } from 'vitest';
import {
  clampGoals,
  dailyScore,
  DEFAULT_GOALS,
  estimateActiveMin,
  estimateKcal,
  goalMet,
  goalStreak,
  hrZone,
  periodDays,
  scoreLabel,
  summarize,
  weekStrip,
  type DayMetrics,
} from '../daily';

const G = DEFAULT_GOALS; // 10,000 steps · 30 min · 500 kcal
const day = (d: string, steps: number, activeMin = 0, kcal = 0): DayMetrics => ({ day: d, steps, activeMin, kcal });
const map = (...days: DayMetrics[]) => new Map(days.map((d) => [d.day, d]));
// Wed 15 Oct 2025, mid-afternoon local time
const NOW = new Date(2025, 9, 15, 15, 0, 0);

describe('dailyScore', () => {
  it('is 0 with no movement and 1000 with every goal met', () => {
    expect(dailyScore({ steps: 0, activeMin: 0, kcal: 0 }, G)).toBe(0);
    expect(dailyScore({ steps: 10000, activeMin: 30, kcal: 500 }, G)).toBe(1000);
  });

  it('weights steps 50%, active minutes 30%, calories 20%', () => {
    expect(dailyScore({ steps: 10000, activeMin: 0, kcal: 0 }, G)).toBe(500);
    expect(dailyScore({ steps: 0, activeMin: 30, kcal: 0 }, G)).toBe(300);
    expect(dailyScore({ steps: 0, activeMin: 0, kcal: 500 }, G)).toBe(200);
    expect(dailyScore({ steps: 5000, activeMin: 15, kcal: 250 }, G)).toBe(500);
  });

  it('caps each part at its goal, so one big number cannot cover a missing one', () => {
    expect(dailyScore({ steps: 40000, activeMin: 0, kcal: 0 }, G)).toBe(500);
    expect(dailyScore({ steps: 12456, activeMin: 78, kcal: 632 }, G)).toBe(1000);
  });

  it('never goes negative or past 1000 on bad input', () => {
    expect(dailyScore({ steps: -50, activeMin: -1, kcal: NaN }, G)).toBe(0);
    expect(dailyScore({ steps: 1e9, activeMin: 1e9, kcal: 1e9 }, G)).toBe(1000);
  });

  it('follows the user goals', () => {
    const easy = { ...G, steps: 5000 };
    expect(dailyScore({ steps: 5000, activeMin: 0, kcal: 0 }, easy)).toBe(500);
  });
});

describe('scoreLabel', () => {
  it('labels the score in tiers', () => {
    expect(scoreLabel(1000).label).toBe('Excellent');
    expect(scoreLabel(850).label).toBe('Excellent');
    expect(scoreLabel(849).label).toBe('Great');
    expect(scoreLabel(500).label).toBe('Good');
    expect(scoreLabel(200).label).toBe('Fair');
    expect(scoreLabel(0).label).toBe('Getting started');
  });
});

describe('goals', () => {
  it('clamps and rounds what the editor saves', () => {
    expect(clampGoals({ steps: 123456, activeMin: 2, kcal: 333 })).toEqual({ steps: 50000, activeMin: 5, kcal: 350, age: null });
    expect(clampGoals({}).steps).toBe(10000);
    expect(clampGoals({ age: 34.4 }).age).toBe(34);
  });

  it('marks a day met only at the step goal', () => {
    expect(goalMet(day('2025-10-15', 9999), G)).toBe(false);
    expect(goalMet(day('2025-10-15', 10000), G)).toBe(true);
    expect(goalMet(undefined, G)).toBe(false);
  });
});

describe('estimates', () => {
  it('estimates calories and brisk minutes from steps', () => {
    expect(estimateKcal(10000)).toBe(400);
    expect(estimateActiveMin(3000)).toBe(0);
    expect(estimateActiveMin(15000)).toBe(100);
    expect(estimateActiveMin(5000, 42)).toBe(42); // a recorded run beats the guess
  });
});

describe('periods', () => {
  it('weeks run Monday to Sunday and months cover every day', () => {
    const w = periodDays('week', NOW);
    expect(w[0]).toBe('2025-10-13');
    expect(w[6]).toBe('2025-10-19');
    const m = periodDays('month', NOW);
    expect(m).toHaveLength(31);
    expect(m[0]).toBe('2025-10-01');
    expect(periodDays('day', NOW)).toEqual(['2025-10-15']);
  });

  it('a Sunday still belongs to the week that started on Monday', () => {
    const sun = new Date(2025, 9, 19, 9);
    expect(periodDays('week', sun)[0]).toBe('2025-10-13');
  });

  it('sums the elapsed days only and averages the daily score', () => {
    const data = map(day('2025-10-13', 10000, 30, 500), day('2025-10-14', 5000, 15, 250), day('2025-10-20', 99999));
    const s = summarize(data, 'week', NOW, G);
    expect(s.elapsed).toBe(3); // Mon, Tue, Wed (today)
    expect(s.steps).toBe(15000);
    expect(s.goalSteps).toBe(30000);
    expect(s.daysMet).toBe(1);
    expect(s.score).toBe(Math.round((1000 + 500 + 0) / 3));
    expect(s.best?.day).toBe('2025-10-13');
  });

  it("'day' is just today", () => {
    const s = summarize(map(day('2025-10-15', 12456, 78, 632)), 'day', NOW, G);
    expect(s.steps).toBe(12456);
    expect(s.score).toBe(1000);
  });
});

describe('weekStrip', () => {
  it('marks goal days, today and the future', () => {
    const strip = weekStrip(map(day('2025-10-13', 11000), day('2025-10-14', 3000), day('2025-10-15', 10500)), NOW, G);
    expect(strip.map((d) => d.letter).join('')).toBe('MTWTFSS');
    expect(strip.map((d) => d.met)).toEqual([true, false, true, false, false, false, false]);
    expect(strip[2].isToday).toBe(true);
    expect(strip[3].isFuture).toBe(true);
    expect(strip[0].date).toBe(13);
  });
});

describe('goalStreak', () => {
  it('counts back from today, or from yesterday while today is still open', () => {
    const data = map(day('2025-10-13', 10000), day('2025-10-14', 10000));
    expect(goalStreak(data, NOW, G)).toBe(2);
    data.set('2025-10-15', day('2025-10-15', 10000));
    expect(goalStreak(data, NOW, G)).toBe(3);
    expect(goalStreak(new Map(), NOW, G)).toBe(0);
  });
});

describe('hrZone', () => {
  it('needs an age and maps % of max heart rate to zones', () => {
    expect(hrZone(128, null)).toBeNull();
    expect(hrZone(128, 30)?.zone).toBe(2); // 128 / 190 = 67%
    expect(hrZone(140, 30)).toEqual({ zone: 3, name: 'Cardio' });
    expect(hrZone(180, 30)?.name).toBe('Peak');
    expect(hrZone(80, 30)).toBeNull();
  });
});
