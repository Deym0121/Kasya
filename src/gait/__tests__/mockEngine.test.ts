import { describe, it, expect } from 'vitest';
import { MockGaitEngine } from '../MockGaitEngine';

describe('MockGaitEngine', () => {
  it('returns a believable, trustworthy gait result without needing real frames', async () => {
    const engine = new MockGaitEngine();
    const result = await engine.analyze({ frames: [] });
    expect(engine.name).toBe('mock');
    expect(result.cadence.value).toBeGreaterThan(0);
    expect(result.captureQuality.ok).toBe(true);
  });
});
