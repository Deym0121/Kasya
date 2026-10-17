/** One local-calendar day of activity totals — the ONLY step data that ever leaves the phone. */
export interface StepDay {
  /** YYYY-MM-DD in the user's LOCAL calendar */
  day: string;
  steps: number;
  activeMin: number;
  kcal: number;
}
