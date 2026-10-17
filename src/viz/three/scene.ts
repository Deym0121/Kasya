import type { Landmark } from '../../gait/types';
import { madd3, norm3, sub3, v3, type V3 } from './math';
import { hex, setDetail, type Part, type RGBA } from './mesh';
import { buildRig, type Body, type Rig, type Stage } from './rig';
import { buildHuman } from './human';
import { buildSkeleton } from './bones';
import { renderScene, type Batch, type Camera, type Look } from './render';

/**
 * One replay frame → draw batches, for the three views:
 *  - human: the clothed runner (male or female build);
 *  - anatomy: an X-ray — glowing translucent body with the skeleton inside;
 *  - skeleton: bones only, ivory, lit like a museum specimen.
 * Pure: the RN component owns playback/camera state and just draws the batches.
 */

export type ReplayView = 'human' | 'anatomy' | 'skeleton';

export interface ViewState {
  view: ReplayView;
  body: Body;
  /** camera orbit (radians, 0 = the filmed side view) and elevation */
  yaw: number;
  pitch: number;
  width: number;
  height: number;
  /** seconds into the replay (secondary motion, glow pulse) */
  time: number;
  /** landmark indices (hips/knees/ankles) flagged by the analysis */
  flagged: number[];
  /** camera zoom (1 = whole body) and what to centre on when zoomed */
  zoom?: number;
  focus?: 'body' | 'head';
  /** mesh level of detail, 0.5–1 (lowered on slow devices) */
  detail?: number;
}

const LOOKS: Record<ReplayView, Look> = {
  human: { bg: [hex('#1D2129'), hex('#0B0C0F')], floor: [0.2, 0.22, 0.27, 0.95], grid: [1, 1, 1, 0.07], shadow: 0.55 },
  anatomy: { bg: [hex('#061427'), hex('#01040A')], floor: [0.08, 0.25, 0.45, 0.35], grid: [0.4, 0.78, 1, 0.13], shadow: 0 },
  skeleton: { bg: [hex('#1A1C21'), hex('#08090B')], floor: [0.2, 0.2, 0.22, 0.9], grid: [1, 1, 1, 0.06], shadow: 0.45 },
};

const GLOW_WARM: RGBA = [1, 0.36, 0.22, 1];
const JOINT_BLUE: RGBA = [0.56, 0.85, 0.97, 1];

/** The camera for a view state, framing a standing person around their pelvis. */
export function cameraFor(rig: Rig, s: ViewState): Camera {
  const fov = (30 * Math.PI) / 180;
  const aspect = s.width / Math.max(1, s.height);
  // Fit ~1.3 statures vertically (room for the stage's chips); ~0.9 across on narrow stages.
  const fitH = 1.3 / 2 / Math.tan(fov / 2);
  const fitW = 0.9 / 2 / (Math.tan(fov / 2) * aspect);
  const zoom = Math.max(1, s.zoom ?? 1);
  const target = s.focus === 'head' ? rig.head.o : v3(rig.pelvis.o.x, 0.5, 0);
  return {
    yaw: s.yaw,
    pitch: s.pitch,
    dist: Math.max(fitH, fitW) / zoom,
    target,
    fov,
    width: s.width,
    height: s.height,
  };
}

export function composeFrame(L: Landmark[], stage: Stage, s: ViewState): Batch[] {
  setDetail(s.detail ?? 1);
  const rig = buildRig(L, stage, s.body);
  const cam = cameraFor(rig, s);
  let solid: Part[] = [];
  let glowing: Part[] = [];
  if (s.view === 'human') {
    solid = buildHuman(rig, s.body, { time: s.time });
  } else if (s.view === 'skeleton') {
    solid = buildSkeleton(rig, s.body, 'bone');
  } else {
    glowing = [...buildSkeleton(rig, s.body, 'xbone'), ...buildHuman(rig, s.body, { shell: true })];
  }

  const shadowAt = LOOKS[s.view].shadow > 0 ? contactShadows(rig) : [];
  const pulse = 0.75 + 0.25 * Math.sin(s.time * Math.PI * 2 * 0.9);
  const glows: { p: V3; radius: number; color: RGBA; strength: number }[] = [];
  for (const k of [23, 24, 25, 26, 27, 28]) {
    const p = rig.joint(k);
    if (!p) continue;
    if (s.flagged.includes(k)) glows.push({ p, radius: 0.07, color: GLOW_WARM, strength: 0.85 * pulse });
    else if (s.view === 'anatomy') glows.push({ p, radius: 0.028, color: JOINT_BLUE, strength: 0.55 });
  }
  return renderScene(cam, LOOKS[s.view], { solid, glowing, shadowAt, glows });
}

function contactShadows(rig: Rig) {
  const out: { p: V3; along?: V3; rx: number; rz: number; strength: number }[] = [];
  for (const side of ['r', 'l'] as const) {
    const j = rig.limbs[side];
    const mid = v3((j.heel.x + j.toe.x) / 2, 0, (j.heel.z + j.toe.z) / 2);
    const lift = Math.min(j.heel.y, j.toe.y);
    const strength = Math.max(0, 1 - lift / 0.12);
    if (strength > 0) out.push({ p: mid, along: norm3(sub3(j.toe, j.heel)), rx: 0.1, rz: 0.045, strength });
  }
  out.push({ p: madd3(rig.pelvis.o, v3(0, 1, 0), 0), rx: 0.26, rz: 0.17, strength: 0.45 });
  return out;
}
