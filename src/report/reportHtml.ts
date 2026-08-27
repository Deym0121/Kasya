import { GaitReportRecord } from '../storage/reportRecord';
import { matchShoes } from '../shoes/match';
import { SHOES } from '../data/shoes';

/**
 * The printable gait report, built as one self-contained HTML document (inline
 * CSS, no external assets) so expo-print can turn it into a PDF on native and
 * the browser's print dialog can save it on web — entirely from on-device data.
 *
 * Wellness-framed like everything else: estimates + the standing disclaimer,
 * never a prescription. Pure module (no RN imports) so it's unit-tested in node.
 */

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function row(label: string, value: string): string {
  return `<tr><td class="k">${label}</td><td class="v">${value}</td></tr>`;
}

export function buildReportHtml(report: GaitReportRecord): string {
  const cadence = Math.round(report.result.cadence.value);
  const goal = esc(report.scanType.replace(/_/g, ' '));
  const date = new Date(report.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  const q = report.result.captureQuality;
  const m = report.metrics;
  const f = report.frontal?.metrics;

  const metricRows: string[] = [
    row('Cadence', `about ${cadence} steps/min (${esc(report.result.cadence.confidence)} confidence)`),
    row('Steps captured', `${report.result.stepCount} over ${Math.round(report.result.durationSec)}s`),
    row('Capture quality', `${Math.round(q.visibilityScore * 100)}% visible · ${q.gaitCyclesDetected} gait cycles`),
  ];
  if (m?.rhythmRegularityPct != null) metricRows.push(row('Step rhythm', `about ${Math.round(m.rhythmRegularityPct)}% regular`));
  if (m?.symmetryPct != null) metricRows.push(row('Left/right symmetry', `about ${Math.round(m.symmetryPct)}%`));
  if (m?.verticalOscillationPct != null) metricRows.push(row('Vertical bounce', `about ${Math.round(m.verticalOscillationPct)}%`));
  if (m?.kneeFlexionRangeDeg != null) metricRows.push(row('Knee flexion range', `about ${Math.round(m.kneeFlexionRangeDeg)}°`));
  if (f?.hipDropPct != null) metricRows.push(row('Hip level (rear view)', `about ${Math.round(f.hipDropPct)}% drop`));
  if (f?.stepWidthPct != null) metricRows.push(row('Base of support (rear view)', `about ${Math.round(f.stepWidthPct)}%`));

  const walkthrough = report.walkthrough?.length
    ? `<h2>How your step works</h2><ol>${report.walkthrough.map((w) => `<li>${esc(w)}</li>`).join('')}</ol>`
    : '';

  const matches = matchShoes(SHOES, {
    useCase: report.scanType,
    gait: { cadenceSpm: report.result.cadence.value, bouncePct: m?.verticalOscillationPct },
  }).slice(0, 3);
  const shoeRows = matches
    .map(
      (x, i) =>
        `<div class="match-row"><span class="rank">${i + 1}</span><div><strong>${esc(x.shoe.brand)} ${esc(x.shoe.model)}</strong>` +
        `<div class="muted">${esc(x.shoe.category.replace(/_/g, ' '))} · ${esc(x.shoe.cushion)} cushion · ₱${x.shoe.priceMin.toLocaleString()}–${x.shoe.priceMax.toLocaleString()} · ${x.score}% match</div></div></div>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Kasya gait report — ${date}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #15161B; padding: 40px 44px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .dot { width: 14px; height: 14px; border-radius: 7px; background: #FF4D0D; }
  .brand b { font-size: 22px; letter-spacing: -0.4px; }
  .sub { color: #6B6E76; font-size: 13px; margin-top: 4px; }
  .hero { background: #15161B; color: #fff; border-radius: 16px; padding: 26px 28px; margin-top: 22px; }
  .hero .kicker { color: #FF8A54; font-size: 12px; letter-spacing: 2px; font-weight: 700; }
  .hero .num { font-size: 64px; font-weight: 800; letter-spacing: -2px; line-height: 1.1; }
  .hero .unit { font-size: 20px; color: rgba(255,255,255,0.8); margin-left: 6px; }
  .hero .cap { color: rgba(255,255,255,0.72); font-size: 13px; margin-top: 2px; }
  h2 { font-size: 16px; margin: 26px 0 10px; letter-spacing: -0.2px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 8px 0; border-bottom: 1px solid #ECEAE4; font-size: 14px; }
  td.k { color: #6B6E76; width: 46%; }
  td.v { font-weight: 600; }
  ol { padding-left: 20px; }
  li { font-size: 14px; line-height: 1.6; margin-bottom: 4px; }
  .match-row { display: flex; align-items: center; gap: 12px; padding: 9px 0; border-bottom: 1px solid #ECEAE4; font-size: 14px; }
  .rank { width: 22px; height: 22px; border-radius: 11px; background: #15161B; color: #fff; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex: none; }
  .muted { color: #6B6E76; font-size: 12.5px; margin-top: 2px; }
  .tip { background: #FFE9DF; border-radius: 12px; padding: 14px 16px; font-size: 14px; line-height: 1.5; margin-top: 10px; }
  .disc { color: #6B6E76; font-size: 11.5px; line-height: 1.6; margin-top: 30px; border-top: 1px solid #ECEAE4; padding-top: 14px; }
  .demo { background: #FFE9DF; color: #B4400F; border-radius: 8px; padding: 8px 12px; font-size: 12.5px; font-weight: 700; margin-top: 12px; }
</style>
</head>
<body>
  <div class="brand"><span class="dot"></span><b>Kasya</b></div>
  <div class="sub">Gait scan report · ${goal} · ${date}</div>
  ${report.simulated ? '<div class="demo">DEMO — sample data from a simulated scan, not a reading of your own gait.</div>' : ''}

  <div class="hero">
    <div class="kicker">CADENCE${report.simulated ? ' · DEMO' : ''}</div>
    <div><span class="num">${cadence}</span><span class="unit">spm</span></div>
    <div class="cap">steps per minute · every number in this report is an estimate from a single-camera scan</div>
  </div>

  <h2>Coaching tip</h2>
  <div class="tip">${esc(report.cadenceTip)}</div>

  <h2>Your numbers</h2>
  <table>${metricRows.join('')}</table>

  ${walkthrough}

  <h2>Top shoe matches</h2>
  ${shoeRows}
  <div class="muted" style="margin-top:8px">Comfort-led estimates matched to your goal and movement — prices are approximate bands; try shoes on before buying.</div>

  <div class="disc">
    Kasya gives wellness and shoe-selection estimates — not medical advice or a diagnosis. For pain
    or concerns, see a qualified professional. Generated on-device by Kasya; this report contains only
    derived numbers, never video.
  </div>
</body>
</html>`;
}
