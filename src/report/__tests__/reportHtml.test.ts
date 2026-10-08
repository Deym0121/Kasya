import { describe, it, expect } from 'vitest';
import { buildReportHtml } from '../reportHtml';
import { GaitReportRecord } from '../../storage/reportRecord';

const report = {
  id: 'r1',
  createdAt: '2026-07-06T10:00:00Z',
  scanType: 'running',
  result: {
    cadence: { value: 167.6, unit: 'spm', confidence: 'high' },
    stepCount: 27,
    durationSec: 10,
    captureQuality: { visibilityScore: 0.9, gaitCyclesDetected: 6, ok: true, issues: [] },
  },
  cadenceTip: 'Nice steady rhythm — keep it up.',
  metrics: { verticalOscillationPct: 9, symmetryPct: 96, rhythmRegularityPct: 92, kneeFlexionRangeDeg: 41, overstrideScore: 3 },
  walkthrough: ['Your left foot lands softly.', 'Push-off looks even.'],
} as unknown as GaitReportRecord;

describe('buildReportHtml', () => {
  it('is a complete, self-contained HTML document', () => {
    const html = buildReportHtml(report);
    expect(html.trimStart().toLowerCase().startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('</html>');
    expect(html).not.toMatch(/src=["']https?:/); // no external assets — prints offline
  });

  it('carries the branding, headline cadence and scan facts', () => {
    const html = buildReportHtml(report);
    expect(html).toContain('Kasya');
    expect(html).toContain('168');
    expect(html).toContain('spm');
    expect(html).toContain('running');
    expect(html).toContain('96'); // symmetry
  });

  it('includes the walkthrough and top shoe matches', () => {
    const html = buildReportHtml(report);
    expect(html).toContain('Your left foot lands softly.');
    expect(html).toContain('Top shoe matches');
    expect((html.match(/match-row/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('handles a minimal report without leaking "undefined"', () => {
    const minimal = {
      id: 'x',
      createdAt: '2026-07-06T10:00:00Z',
      scanType: 'walking',
      result: report.result,
      cadenceTip: 'tip',
    } as unknown as GaitReportRecord;
    const html = buildReportHtml(minimal);
    expect(html).not.toContain('undefined');
    expect(html).toContain('168');
  });

  it('escapes user-influenced text', () => {
    const weird = { ...report, scanType: 'run & <script>' } as GaitReportRecord;
    const html = buildReportHtml(weird);
    expect(html).toContain('run &amp; &lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('stays wellness-framed: hedged disclaimer present, no prescriptive language', () => {
    const html = buildReportHtml(report).toLowerCase();
    expect(html).toContain('not medical advice');
    expect(html).not.toMatch(/pronat|orthotic|corrects|abnormal|injur/);
  });

  it('applies the saved budget to the report’s top shoe picks', () => {
    const html = buildReportHtml(report, { budgetMaxPhp: 2000 });
    const prices = [...html.matchAll(/₱([\d,]+)–[\d,]+ · \d+% match/g)].map((m) => Number(m[1].replace(/,/g, '')));
    expect(prices).toHaveLength(3);
    expect(prices.every((p) => p <= 2000)).toBe(true);
    expect(html).not.toContain('over your budget');
  });
});
