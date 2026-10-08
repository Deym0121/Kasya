import { describe, it, expect } from 'vitest';
import { toPoseFrame } from '../poseMapper';
import { LANDMARK, LANDMARK_COUNT } from '../types';

describe('toPoseFrame', () => {
  it('positions landmarks by their MediaPipe index and keeps the timestamp', () => {
    const raw: any[] = new Array(LANDMARK_COUNT).fill(null);
    raw[LANDMARK.LEFT_ANKLE] = { x: 0.4, y: 0.9, z: 0.1, visibility: 0.8 };
    raw[LANDMARK.RIGHT_ANKLE] = { x: 0.6, y: 0.9, visibility: 0.7 };

    const f = toPoseFrame(raw, 1234);

    expect(f.t).toBe(1234);
    expect(f.landmarks).toHaveLength(LANDMARK_COUNT);
    expect(f.landmarks[LANDMARK.LEFT_ANKLE].x).toBe(0.4);
    expect(f.landmarks[LANDMARK.LEFT_ANKLE].y).toBe(0.9);
    expect(f.landmarks[LANDMARK.LEFT_ANKLE].visibility).toBe(0.8);
    expect(f.landmarks[LANDMARK.RIGHT_ANKLE].visibility).toBe(0.7);
  });

  it('falls back to presence when visibility is absent', () => {
    const raw: any[] = new Array(LANDMARK_COUNT).fill(null);
    raw[LANDMARK.LEFT_HEEL] = { x: 0.5, y: 0.95, presence: 0.6 };
    const f = toPoseFrame(raw, 0);
    expect(f.landmarks[LANDMARK.LEFT_HEEL].visibility).toBe(0.6);
  });

  it('aspect-corrects x into frame-HEIGHT units (isotropic, like native) and leaves y alone', () => {
    const raw: any[] = new Array(LANDMARK_COUNT).fill(null);
    raw[LANDMARK.LEFT_ANKLE] = { x: 0.45, y: 0.9, visibility: 0.9 };
    const f = toPoseFrame(raw, 0, { aspect: 16 / 9 });
    expect(f.landmarks[LANDMARK.LEFT_ANKLE].x).toBeCloseTo(0.8, 10);
    expect(f.landmarks[LANDMARK.LEFT_ANKLE].y).toBe(0.9);
    // Missing landmarks stay {0,0} so viewers can still recognise and skip them.
    expect(f.landmarks[LANDMARK.RIGHT_ANKLE]).toEqual({ x: 0, y: 0, visibility: 0 });
    // No / invalid aspect → unchanged (native frames are already isotropic).
    expect(toPoseFrame(raw, 0).landmarks[LANDMARK.LEFT_ANKLE].x).toBe(0.45);
    expect(toPoseFrame(raw, 0, { aspect: NaN }).landmarks[LANDMARK.LEFT_ANKLE].x).toBe(0.45);
  });

  it('marks missing landmarks as not visible so capture quality can flag them', () => {
    const raw: any[] = new Array(LANDMARK_COUNT).fill(null);
    const f = toPoseFrame(raw, 0);
    expect(f.landmarks[0].visibility).toBe(0);
    expect(f.landmarks[LANDMARK.LEFT_KNEE].visibility).toBe(0);
  });
});
