// Web: browsers have no pedometer — step counts come from the phone app.
export async function stepsPermission(): Promise<boolean> {
  return false;
}

export async function phoneStepsBetween(_start: Date, _end: Date): Promise<number | null> {
  return null;
}

export function watchPhoneSteps(_onSteps: (stepsSinceStart: number) => void): () => void {
  return () => {};
}

export const hasStepHistory = false;
