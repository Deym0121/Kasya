import * as TaskManager from 'expo-task-manager';
import type { LocationObject } from 'expo-location';
import { LOCATION_TASK, toFix, stopTracking } from './location';
import { session } from './session';

/**
 * Background GPS delivery. Must be defined at module scope during app start
 * (imported from index.ts) so the OS can hand fixes to JS even when Kasya was
 * woken in the background, including Android's headless relaunch of the
 * foreground service.
 */
TaskManager.defineTask<{ locations: LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const active = await session.restore();
  if (!active || !session.recorder || session.recorder.status === 'finished') {
    // Orphaned task (recording already saved/discarded) — stop burning battery.
    await stopTracking();
    return;
  }
  // ingest() itself ignores fixes while manually paused
  session.ingest(data.locations.map(toFix));
});
