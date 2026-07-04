/**
 * Plain-English explainers for every metric the app shows, plus "typical range"
 * bands used to tint outlier tiles. Pure TS (no RN imports) so the copy is
 * unit-tested in node like the rest of the gait language.
 *
 * The bands deliberately mirror the flag thresholds in form.ts / frontal.ts so
 * a tinted tile never contradicts the written observations. All copy is
 * wellness-hedged: framed as observations, never targets or judgments.
 */

export type MetricKey =
  | 'cadence'
  | 'stepTime'
  | 'stance'
  | 'bounce'
  | 'overstride'
  | 'rhythm'
  | 'symmetry'
  | 'kneeBend'
  | 'hipDrop'
  | 'baseWidth'
  | 'sway'
  | 'rearSymmetry';

export interface MetricInfoEntry {
  /** display name, e.g. 'Cadence' */
  label: string;
  unit?: string;
  /** one sentence: what it is, zero jargon */
  plain: string;
  /** one hedged typical-range sentence — an observation, never a target */
  typical: string;
}

export const METRIC_INFO: Record<MetricKey, MetricInfoEntry> = {
  cadence: {
    label: 'Cadence',
    unit: 'spm',
    plain: 'How many steps you take per minute.',
    typical:
      'Many walkers land around 90–130 steps per minute and runners often sit higher — this is an estimate from your scan, not a target.',
  },
  stepTime: {
    label: 'Step time',
    unit: 's',
    plain: 'The average time from one footfall to the next.',
    typical: 'Around 0.4–0.7s per step is common — it varies a lot with pace, and quicker cadences mean shorter steps.',
  },
  stance: {
    label: 'Stance',
    unit: '%',
    plain: 'The share of each step your foot spends on the ground.',
    typical: 'Around 55–65% is common at easy paces — it varies with speed and is an estimate from 2D video.',
  },
  bounce: {
    label: 'Bounce',
    unit: '%',
    plain: 'How much your hips rise and fall each step, as a share of leg length.',
    typical: 'Under about 12% is common; quicker, lighter steps usually lower it.',
  },
  overstride: {
    label: 'Overstride',
    unit: '/100',
    plain: 'How far your foot lands ahead of your hips, scored 0–100.',
    typical: 'Lower scores are common; landing closer under your body often feels smoother.',
  },
  rhythm: {
    label: 'Rhythm',
    unit: '%',
    plain: 'How evenly spaced your steps were through the scan.',
    typical: 'Above about 70% reads as steady; some day-to-day variation is typical.',
  },
  symmetry: {
    label: 'Symmetry',
    unit: '%',
    plain: 'How alike your left and right steps looked in timing.',
    typical: 'Above about 75% is common; a clean side-on capture gives the most reliable read.',
  },
  kneeBend: {
    label: 'Knee bend',
    unit: '°',
    plain: 'The range your knees moved through during the stride.',
    typical: 'This varies a lot with speed and style — around 30–60° is often seen when walking.',
  },
  hipDrop: {
    label: 'Hip drop',
    plain: 'How much the pelvis tilts side to side with each step, seen from behind.',
    typical: 'Some tilt is typical; lower values read as steadier hips. This is a rough estimate from 2D video.',
  },
  baseWidth: {
    label: 'Base width',
    unit: '%',
    plain: 'How far apart your feet land, as a share of hip width.',
    typical: 'Around hip-width is common — comfort is a better guide than any exact number.',
  },
  sway: {
    label: 'Sway',
    plain: 'How much your hips drift side to side as you move, seen from behind.',
    typical: 'Lower values read as steadier; a tall, relaxed posture often calms sway.',
  },
  rearSymmetry: {
    label: 'Symmetry (rear)',
    unit: '%',
    plain: 'How alike your two sides looked from behind.',
    typical: 'Above about 80% is common; re-check with a clean rear capture before reading much into a difference.',
  },
};

/**
 * Is this value inside the broad typical band? Mirrors the exact flag logic in
 * form.ts / frontal.ts feedback so tinting and text always agree. Metrics with
 * no flag threshold (cadence, stepTime, stance, kneeBend) are never tinted.
 * A value of 0 means "not measured" (the analyzers emit 0 on poor data).
 */
export function typicalBand(key: MetricKey, value: number): 'typical' | 'outside' | 'unknown' {
  if (!Number.isFinite(value) || value === 0) return 'unknown';
  switch (key) {
    case 'bounce':
      return value >= 12 ? 'outside' : 'typical'; // form.ts flags >= 12
    case 'overstride':
      return value >= 65 ? 'outside' : 'typical'; // form.ts flags >= 65
    case 'rhythm':
      return value < 70 ? 'outside' : 'typical'; // form.ts flags < 70
    case 'symmetry':
      return value < 75 ? 'outside' : 'typical'; // form.ts flags < 75
    case 'hipDrop':
      return value >= 22 ? 'outside' : 'typical'; // frontal.ts flags >= 22
    case 'baseWidth':
      return value >= 130 || value <= 45 ? 'outside' : 'typical'; // frontal.ts notes wide/narrow
    case 'sway':
      return value >= 14 ? 'outside' : 'typical'; // frontal.ts flags >= 14
    case 'rearSymmetry':
      return value < 80 ? 'outside' : 'typical'; // frontal.ts flags < 80
    default:
      return 'unknown';
  }
}
