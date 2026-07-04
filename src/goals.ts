/** The scan goals, shared by ScanSetup (picker) and History (labels/chips). */
export const GOALS = [
  { key: 'running', label: 'Running', icon: 'activity' },
  { key: 'walking', label: 'Walking', icon: 'navigation' },
  { key: 'gym', label: 'Gym / training', icon: 'zap' },
  { key: 'daily_comfort', label: 'Daily comfort', icon: 'sun' },
  { key: 'recovery', label: 'Recovery', icon: 'heart' },
] as const;

export type GoalKey = (typeof GOALS)[number]['key'];

export function goalLabel(key: string): string {
  return GOALS.find((g) => g.key === key)?.label ?? key.replace(/_/g, ' ');
}
