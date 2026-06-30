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

  it('marks missing landmarks as not visible so capture quality can flag them', () => {
    const raw: any[] = new Array(LANDMARK_COUNT).fill(null);
    const f = toPoseFrame(raw, 0);
    expect(f.landmarks[0].visibility).toBe(0);
    expect(f.landmarks[LANDMARK.LEFT_KNEE].visibility).toBe(0);
  });
});
