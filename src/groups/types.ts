/** One local-calendar day of activity totals — the ONLY step data that ever leaves the phone. */
export interface StepDay {
  /** YYYY-MM-DD in the user's LOCAL calendar */
  day: string;
  steps: number;
  activeMin: number;
  kcal: number;
  /** metres run that day (Kasya-recorded + Apple Health runs); omitted = 0 */
  runM?: number;
  /** moving seconds of those runs (pace = runSec / runM) */
  runSec?: number;
}
