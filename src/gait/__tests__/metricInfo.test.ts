import { describe, it, expect } from 'vitest';
import { METRIC_INFO, typicalBand, MetricKey } from '../metricInfo';

const KEYS = Object.keys(METRIC_INFO) as MetricKey[];
const allText = KEYS.map((k) => {
  const e = METRIC_INFO[k];
  return `${e.label} ${e.plain} ${e.typical}`;
}).join(' ');

describe('METRIC_INFO', () => {
  it('has a non-empty label, plain and typical line for every metric', () => {
    for (const k of KEYS) {
      const e = METRIC_INFO[k];
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.plain.length).toBeGreaterThan(10);
      expect(e.typical.length).toBeGreaterThan(10);
    }
  });

  it('never uses medical, diagnostic, or prescriptive language', () => {
    const lower = allText.toLowerCase();
    expect(lower).not.toMatch(/injur|diagnos|pronation|abnormal|medical|disease/);
    expect(lower).not.toMatch(/\bshould\b|\bmust\b|\brisk\b|\bproblem\b|\bfault\b|imbalance|\bcorrect\b/);
  });

  it('hedges every typical-range line', () => {
    for (const k of KEYS) {
      expect(METRIC_INFO[k].typical.toLowerCase()).toMatch(/many|often|around|about|estimate|varies|typical|common/);
    }
  });
});

describe('typicalBand', () => {
  it('mirrors the form.ts flag thresholds', () => {
    expect(typicalBand('bounce', 8)).toBe('typical');
    expect(typicalBand('bounce', 15)).toBe('outside');
    expect(typicalBand('overstride', 88)).toBe('outside');
    expect(typicalBand('overstride', 30)).toBe('typical');
    expect(typicalBand('rhythm', 85)).toBe('typical');
    expect(typicalBand('rhythm', 50)).toBe('outside');
    expect(typicalBand('symmetry', 60)).toBe('outside');
  });

  it('mirrors the frontal.ts thresholds for rear-view metrics', () => {
    expect(typicalBand('hipDrop', 10)).toBe('typical');
    expect(typicalBand('hipDrop', 30)).toBe('outside');
    expect(typicalBand('baseWidth', 80)).toBe('typical');
    expect(typicalBand('baseWidth', 140)).toBe('outside');
    expect(typicalBand('baseWidth', 30)).toBe('outside');
    expect(typicalBand('sway', 20)).toBe('outside');
    expect(typicalBand('rearSymmetry', 95)).toBe('typical');
  });

  it('returns unknown for unmeasured values and unbanded metrics', () => {
    expect(typicalBand('rhythm', 0)).toBe('unknown');
    expect(typicalBand('cadence', 165)).toBe('unknown'); // cadence is never tinted
    expect(typicalBand('stance', 60)).toBe('unknown');
    expect(typicalBand('kneeBend', 45)).toBe('unknown');
    expect(typicalBand('bounce', NaN)).toBe('unknown');
  });
});
