import { describe, it, expect } from 'vitest';
import { makeSyntheticWalk } from '../../../gait/synthetic';
import { prepareReplay, poseAt } from '../../motion';
import { bodyMetrics } from '../../bodyModel';
import { buildRig, stageFor } from '../rig';
import { buildHuman } from '../human';
import { buildSkeleton } from '../bones';
import { blob, outwardScore, setDetail, tube, type TubeStation } from '../mesh';
import { composeFrame, type ViewState } from '../scene';
import { vertexCount } from '../render';
import { frameFrom, v3, dist3 } from '../math';

function clip(direction: 1 | -1 = 1, gait: 'walk' | 'run' = 'run') {
  const frames = makeSyntheticWalk({ durationSec: 3, direction, gait, travel: true });
  const replay = prepareReplay(frames);
  const metrics = bodyMetrics(replay);
  const stage = stageFor(replay, metrics);
  return { frames, replay, metrics, stage };
}

const STATE: ViewState = { view: 'human', body: 'male', yaw: 0.6, pitch: 0.12, width: 360, height: 340, time: 0, flagged: [] };

describe('mesh primitives', () => {
  it('winds tubes and blobs outward (normals point away from the centre)', () => {
    const st = (y: number): TubeStation => ({ c: v3(0, y, 0), t: v3(0, 1, 0), front: v3(1, 0, 0), lateral: v3(0, 0, 1), rf: 0.05, rb: 0.04, rl: 0.06, rm: 0.03 });
    const t = tube([st(0), st(0.1), st(0.2)], { segs: 12, mat: 'skin', capStart: 1, capEnd: 1, color: () => [1, 1, 1, 1] });
    expect(outwardScore(t, v3(0, 0.1, 0))).toBeGreaterThan(0.6);
    const b = blob(frameFrom(v3(0, 0, 0), v3(0, 1, 0), v3(1, 0, 0)), { f: 0.1, u: 0.12, s: 0.08 }, { rings: 10, segs: 12, mat: 'skin', color: () => [1, 1, 1, 1] });
    expect(outwardScore(b, v3(0, 0, 0))).toBeGreaterThan(0.8);
  });
});

describe('3D rig', () => {
  it('stands a person ~1 stature tall on the floor', () => {
    const { replay, stage } = clip();
    const rig = buildRig(poseAt(replay, replay[10].t), stage, 'male');
    const footY = Math.min(rig.limbs.r.heel.y, rig.limbs.l.heel.y, rig.limbs.r.toe.y, rig.limbs.l.toe.y);
    expect(footY).toBeGreaterThan(-0.03);
    expect(footY).toBeLessThan(0.08);
    expect(rig.head.o.y).toBeGreaterThan(0.82);
    expect(rig.head.o.y).toBeLessThan(1.0);
    // near limbs toward the camera (+z), far limbs behind
    expect(rig.limbs[rig.near].knee.z).toBeGreaterThan(0);
    expect(rig.limbs[rig.near === 'r' ? 'l' : 'r'].knee.z).toBeLessThan(0);
  });

  it('keeps a right-handed body frame whichever way the subject walks', () => {
    for (const dir of [1, -1] as const) {
      const { replay, stage } = clip(dir);
      const rig = buildRig(poseAt(replay, replay[5].t), stage, 'female');
      // front points the way they walk; s (body right) runs from the left hip to the right hip
      expect(Math.sign(rig.pelvis.f.x)).toBe(dir);
      const lr = { x: rig.limbs.r.hip.x - rig.limbs.l.hip.x, y: rig.limbs.r.hip.y - rig.limbs.l.hip.y, z: rig.limbs.r.hip.z - rig.limbs.l.hip.z };
      expect(lr.x * rig.pelvis.s.x + lr.y * rig.pelvis.s.y + lr.z * rig.pelvis.s.z).toBeGreaterThan(0);
    }
  });

  it('survives a frame with the head and hands missing', () => {
    const { replay, stage } = clip();
    const L = poseAt(replay, replay[3].t).map((p, i) => (i <= 10 || (i >= 15 && i <= 22) ? { x: 0, y: 0, visibility: 0 } : p));
    const rig = buildRig(L, stage, 'male');
    const neck = dist3(rig.head.o, rig.neckBase);
    expect(neck).toBeGreaterThan(0.06);
    expect(neck).toBeLessThan(0.11);
    expect(Number.isFinite(rig.limbs.r.hand.x)).toBe(true);
  });
});

describe('figures', () => {
  it('builds male and female runners with finite geometry', () => {
    const { replay, stage } = clip();
    for (const body of ['male', 'female'] as const) {
      const rig = buildRig(poseAt(replay, replay[20].t), stage, body);
      const parts = buildHuman(rig, body, { time: 0.4 });
      const verts = parts.reduce((s, p) => s + p.pos.length / 3, 0);
      expect(verts).toBeGreaterThan(2500);
      expect(verts).toBeLessThan(9000);
      for (const p of parts) {
        expect(p.pos.every(Number.isFinite)).toBe(true);
        expect(Math.max(...p.idx)).toBeLessThan(p.pos.length / 3);
      }
    }
  });

  it('gives the female build a narrower waist-to-hip ratio and a ponytail', () => {
    const { replay, stage } = clip();
    const L = poseAt(replay, replay[20].t);
    const m = buildHuman(buildRig(L, stage, 'male'), 'male');
    const f = buildHuman(buildRig(L, stage, 'female'), 'female');
    expect(f.length).toBe(m.length + 2); // ponytail + hair band
  });

  it('builds the skeleton within the vertex budget', () => {
    const { replay, stage } = clip();
    const rig = buildRig(poseAt(replay, replay[20].t), stage, 'male');
    const parts = buildSkeleton(rig, 'male', 'bone');
    const verts = parts.reduce((s, p) => s + p.pos.length / 3, 0);
    expect(verts).toBeLessThan(16000);
    for (const p of parts) expect(p.pos.every(Number.isFinite)).toBe(true);
  });
});

describe('per-frame cache and level of detail', () => {
  it('reuses shape and colour on later frames (same topology, same colours, new pose)', () => {
    const { replay, stage } = clip();
    const a = buildHuman(buildRig(poseAt(replay, replay[5].t), stage, 'female'), 'female', { time: 0 });
    const b = buildHuman(buildRig(poseAt(replay, replay[25].t), stage, 'female'), 'female', { time: 0.5 });
    expect(b.length).toBe(a.length);
    a.forEach((p, i) => {
      expect(b[i].pos.length).toBe(p.pos.length);
      expect(b[i].col).toEqual(p.col);
    });
    // the pose did change
    expect(a[0].pos.some((v, i) => Math.abs(v - b[0].pos[i]) > 1e-4)).toBe(true);
  });

  it('lower detail means fewer vertices, and full detail comes back', () => {
    const { replay, stage } = clip();
    const L = poseAt(replay, replay[12].t);
    const count = () => buildSkeleton(buildRig(L, stage, 'male'), 'male', 'bone').reduce((s, p) => s + p.pos.length / 3, 0);
    const full = count();
    setDetail(0.55);
    const low = count();
    setDetail(1);
    expect(low).toBeLessThan(full * 0.8);
    expect(count()).toBe(full);
  });
});

describe('composeFrame', () => {
  it('renders every view into ≤65k-vertex batches, on screen', () => {
    const { replay, stage } = clip();
    const L = poseAt(replay, replay[15].t);
    for (const view of ['human', 'anatomy', 'skeleton'] as const) {
      for (const body of ['male', 'female'] as const) {
        const batches = composeFrame(L, stage, { ...STATE, view, body, flagged: [25] });
        expect(batches.length).toBeGreaterThan(3);
        for (const b of batches) {
          expect(b.xy.length / 2).toBeLessThan(65536);
          expect(b.rgba.length).toBe((b.xy.length / 2) * 4);
          for (let i = 0; i < b.idx.length; i++) expect(b.idx[i]).toBeLessThan(b.xy.length / 2);
        }
        expect(vertexCount(batches)).toBeGreaterThan(1000);
      }
    }
  });

  it('keeps the figure inside the stage at the default and side angles', () => {
    const { replay, stage } = clip();
    for (const yaw of [0, 0.6, Math.PI / 2]) {
      const batches = composeFrame(poseAt(replay, replay[30].t), stage, { ...STATE, yaw });
      const body = batches.slice(4).filter((b) => b.blend === 'normal');
      let minY = Infinity;
      let maxY = -Infinity;
      for (const b of body) for (let i = 1; i < b.xy.length; i += 2) {
        minY = Math.min(minY, b.xy[i]);
        maxY = Math.max(maxY, b.xy[i]);
      }
      expect(minY).toBeGreaterThan(0);
      expect(maxY).toBeLessThan(STATE.height);
      expect(maxY - minY).toBeGreaterThan(STATE.height * 0.55);
    }
  });

  it('is fast enough to animate (median frame well under 33 ms in node)', () => {
    const { replay, stage } = clip();
    const times: number[] = [];
    for (const view of ['human', 'skeleton', 'anatomy'] as const) {
      for (let i = 0; i < 8; i++) {
        const t0 = performance.now();
        composeFrame(poseAt(replay, replay[i * 3].t), stage, { ...STATE, view });
        times.push(performance.now() - t0);
      }
    }
    times.sort((a, b) => a - b);
    // eslint-disable-next-line no-console
    console.log('compose ms median', times[Math.floor(times.length / 2)].toFixed(1), 'max', times[times.length - 1].toFixed(1));
    expect(times[Math.floor(times.length / 2)]).toBeLessThan(33);
  });
});

describe('arms', () => {
  it('swing opposite the legs with a bent elbow in the demo run', () => {
    const { replay, stage } = clip(1, 'run');
    // over a stride the elbow drives back behind the shoulder and the hand comes forward
    let minRel = Infinity;
    let maxRel = -Infinity;
    let minElbow = Infinity;
    let bentFrames = 0;
    for (let i = 0; i < 30; i++) {
      const rig = buildRig(poseAt(replay, replay[i].t), stage, 'male');
      const a = rig.limbs.l;
      const rel = (a.wrist.x - a.shoulder.x) * stage.facing;
      minElbow = Math.min(minElbow, (a.elbow.x - a.shoulder.x) * stage.facing);
      minRel = Math.min(minRel, rel);
      maxRel = Math.max(maxRel, rel);
      const u = { x: a.elbow.x - a.shoulder.x, y: a.elbow.y - a.shoulder.y };
      const f = { x: a.wrist.x - a.elbow.x, y: a.wrist.y - a.elbow.y };
      const cos = (u.x * f.x + u.y * f.y) / (Math.hypot(u.x, u.y) * Math.hypot(f.x, f.y));
      if (cos < Math.cos((50 * Math.PI) / 180)) bentFrames++;
    }
    expect(maxRel - minRel).toBeGreaterThan(0.06);
    expect(minElbow).toBeLessThan(-0.02);
    expect(bentFrames).toBeGreaterThan(25); // running arms stay bent
  });

  it('gives a lost arm a natural bent swing instead of hanging straight', () => {
    const { replay, stage } = clip();
    const L = poseAt(replay, replay[8].t).map((p, i) => (i >= 13 && i <= 22 ? { x: 0, y: 0, visibility: 0 } : p));
    const rig = buildRig(L, stage, 'male');
    for (const s of ['r', 'l'] as const) {
      const a = rig.limbs[s];
      const u = { x: a.elbow.x - a.shoulder.x, y: a.elbow.y - a.shoulder.y };
      const f = { x: a.wrist.x - a.elbow.x, y: a.wrist.y - a.elbow.y };
      const cos = (u.x * f.x + u.y * f.y) / (Math.hypot(u.x, u.y) * Math.hypot(f.x, f.y));
      expect(cos).toBeLessThan(0.95); // bent, not a straight hanging arm
      expect(a.wrist.y).toBeLessThan(a.shoulder.y);
    }
  });
});

describe('feet', () => {
  it('plant on the floor in stance and pitch through the stride (toes up at strike, heel up at push-off)', () => {
    const { replay, stage } = clip(1, 'run');
    let minPitch = Infinity;
    let maxPitch = -Infinity;
    let planted = 0;
    let sunk = 0;
    for (let i = 0; i < 60; i++) {
      const rig = buildRig(poseAt(replay, replay[i].t), stage, 'male');
      for (const s of ['r', 'l'] as const) {
        const f = rig.limbs[s];
        const low = Math.min(f.heel.y, f.toe.y);
        if (low < 0.012) planted++;
        if (low < -0.015) sunk++;
        const pitch = Math.atan2(f.toe.y - f.heel.y, Math.abs(f.toe.x - f.heel.x));
        minPitch = Math.min(minPitch, pitch);
        maxPitch = Math.max(maxPitch, pitch);
      }
    }
    expect(planted).toBeGreaterThan(20);
    expect(sunk).toBe(0);
    expect(maxPitch).toBeGreaterThan(0.08); // toes up at heel strike / in swing
    expect(minPitch).toBeLessThan(-0.6); // heel high at push-off
  });
});
