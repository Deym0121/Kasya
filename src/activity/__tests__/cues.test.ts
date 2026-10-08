import { describe, it, expect } from 'vitest';
import { kmCueText, spokenDuration } from '../cues';

describe('voice cue text', () => {
  it('speaks durations in words', () => {
    expect(spokenDuration(332)).toBe('5 minutes 32 seconds');
    expect(spokenDuration(3725)).toBe('1 hour 2 minutes 5 seconds');
    expect(spokenDuration(60)).toBe('1 minute');
    expect(spokenDuration(0)).toBe('0 seconds');
  });

  it('announces km, split pace and time for runs; speed for rides', () => {
    expect(kmCueText({ sport: 'run', km: 3, splitPaceSec: 332, movingSec: 1000 })).toBe(
      'Kilometer 3. Pace 5 minutes 32 seconds per kilometer. Time 16 minutes 40 seconds.',
    );
    expect(kmCueText({ sport: 'ride', km: 10, splitPaceSec: 144, movingSec: 1500 })).toBe(
      'Kilometer 10. Speed 25.0 kilometers per hour. Time 25 minutes.',
    );
    expect(kmCueText({ sport: 'walk', km: 1, splitPaceSec: null, movingSec: 700 })).toBe('Kilometer 1. Time 11 minutes 40 seconds.');
  });
});
