/**
 * Records why the real native camera failed to load, so the simulated-scan
 * fallback can say so honestly instead of pretending nothing happened
 * (a silent fallback made builds 8-14's camera issues invisible in TestFlight).
 * Tiny standalone module to avoid a dispatcher <-> screen import cycle.
 */
export let realCameraError: string | null = null;

export function setRealCameraError(message: string): void {
  realCameraError = message;
}
