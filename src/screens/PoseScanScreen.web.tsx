// @ts-nocheck
//
// Real gait scan on the WEB: runs MediaPipe BlazePose on the webcam, draws the
// live skeleton, captures the landmark time-series, and hands it to the SAME
// tested gait engine (via Processing -> LivePoseGaitEngine -> analyzeGait).
// No native build needed — this runs in any modern browser.
//
// @ts-nocheck: this file uses DOM APIs (video/canvas/getUserMedia) that the RN
// typecheck doesn't model. The analysis logic it feeds (toPoseFrame, analyzeGait)
// is unit-tested separately.
import { useRef, useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, spacing } from '../theme';
import { Button } from '../components';
import { toPoseFrame } from '../gait';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const VISION_ESM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/+esm';

// Load MediaPipe at runtime from CDN as native browser ESM. We do NOT import the
// npm package, because Metro can't statically analyze its internal dynamic
// import() — but that import works fine in a real browser at runtime.
let visionPromise = null;
function loadVision() {
  if (visionPromise) return visionPromise;
  visionPromise = new Promise((resolve, reject) => {
    const cb = '__mpVision__' + Math.floor(performance.now());
    window[cb] = (mod) => {
      resolve(mod);
      try {
        delete window[cb];
      } catch {}
    };
    const s = document.createElement('script');
    s.type = 'module';
    s.textContent = `import * as mp from '${VISION_ESM}'; window['${cb}'](mp);`;
    s.onerror = () => reject(new Error('Could not load the pose model code'));
    document.head.appendChild(s);
  });
  return visionPromise;
}

// BlazePose connections for a full-body skeleton.
const LINES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
];
const CAPTURE_SECONDS = 10;

export default function PoseScanScreen({ navigation, route }) {
  const { goal } = route.params;
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const lmRef = useRef(null);
  const rafRef = useRef(0);
  const framesRef = useRef([]);
  const capturingRef = useRef(false);
  const startRef = useRef(0);
  const [status, setStatus] = useState('loading'); // loading | ready | recording | error
  const [msg, setMsg] = useState('Loading pose model…');
  const [count, setCount] = useState(CAPTURE_SECONDS);

  const render = useCallback(() => {
    const v = videoRef.current;
    const c = canvasRef.current;
    const lm = lmRef.current;
    if (v && c && lm && v.readyState >= 2 && v.videoWidth) {
      if (c.width !== v.videoWidth) {
        c.width = v.videoWidth;
        c.height = v.videoHeight;
      }
      let res;
      try {
        res = lm.detectForVideo(v, performance.now());
      } catch {}
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      const pts = res && res.landmarks && res.landmarks[0];
      if (pts) {
        ctx.strokeStyle = '#39FF14';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        for (const [a, b] of LINES) {
          const pa = pts[a];
          const pb = pts[b];
          if (pa && pb) {
            ctx.beginPath();
            ctx.moveTo(pa.x * c.width, pa.y * c.height);
            ctx.lineTo(pb.x * c.width, pb.y * c.height);
            ctx.stroke();
          }
        }
        ctx.fillStyle = '#FF3B30';
        for (const p of pts) {
          ctx.beginPath();
          ctx.arc(p.x * c.width, p.y * c.height, 5, 0, 6.2832);
          ctx.fill();
        }
        if (capturingRef.current) {
          framesRef.current.push(toPoseFrame(pts, performance.now() - startRef.current));
        }
      }
    }
    rafRef.current = requestAnimationFrame(render);
  }, []);

  useEffect(() => {
    let alive = true;
    let stream = null;
    (async () => {
      try {
        const mp = await loadVision();
        const vision = await mp.FilesetResolver.forVisionTasks(WASM);
        const lm = await mp.PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
        if (!alive) {
          lm.close();
          return;
        }
        lmRef.current = lm;
        setMsg('Starting camera…');
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
          audio: false,
        });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const v = videoRef.current;
        v.srcObject = stream;
        await v.play();
        setStatus('ready');
        rafRef.current = requestAnimationFrame(render);
      } catch (e) {
        if (!alive) return;
        setMsg(String((e && e.message) || e) || 'Camera unavailable');
        setStatus('error');
      }
    })();
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (lmRef.current && lmRef.current.close) lmRef.current.close();
    };
  }, [render]);

  const record = useCallback(() => {
    framesRef.current = [];
    startRef.current = performance.now();
    capturingRef.current = true;
    setStatus('recording');
    let n = CAPTURE_SECONDS;
    setCount(n);
    const iv = setInterval(() => {
      n -= 1;
      setCount(n);
      if (n <= 0) {
        clearInterval(iv);
        capturingRef.current = false;
        navigation.replace('Processing', { goal, frames: framesRef.current });
      }
    }, 1000);
  }, [goal, navigation]);

  const overlayText =
    status === 'recording'
      ? `Recording — ${count}s · walk side-on`
      : status === 'ready'
        ? 'Stand side-on, your whole body in frame'
        : '';

  return (
    <View style={styles.screen}>
      <div style={stageStyle}>
        <video ref={videoRef} autoPlay playsInline muted style={videoStyle} />
        <canvas ref={canvasRef} style={canvasStyle} />
        <div onClick={() => navigation.goBack()} style={closeStyle}>
          ✕ Close
        </div>
        {overlayText ? <div style={hintStyle}>{overlayText}</div> : null}
        {status !== 'ready' && status !== 'recording' ? <div style={msgStyle}>{msg}</div> : null}
      </div>
      <View style={styles.controls}>
        <Button
          label={
            status === 'recording'
              ? `Recording… ${count}s`
              : status === 'error'
                ? 'Run a simulated scan instead'
                : `Record ${CAPTURE_SECONDS} seconds`
          }
          icon={status === 'error' ? 'play' : 'camera'}
          variant="accent"
          disabled={status === 'loading' || status === 'recording'}
          onPress={status === 'error' ? () => navigation.replace('Processing', { goal }) : record}
        />
      </View>
    </View>
  );
}

const stageStyle = {
  position: 'relative',
  width: '100%',
  flex: 1,
  background: '#000',
  overflow: 'hidden',
  display: 'flex',
  minHeight: 360,
};
const videoStyle = { width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' };
const canvasStyle = { position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'scaleX(-1)' };
const closeStyle = {
  position: 'absolute',
  top: 14,
  left: 16,
  color: '#fff',
  font: '600 15px sans-serif',
  cursor: 'pointer',
  textShadow: '0 1px 3px rgba(0,0,0,0.6)',
};
const hintStyle = {
  position: 'absolute',
  top: 14,
  left: 0,
  right: 0,
  textAlign: 'center',
  color: '#fff',
  font: '600 14px sans-serif',
  textShadow: '0 1px 3px rgba(0,0,0,0.6)',
};
const msgStyle = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#fff',
  textAlign: 'center',
  padding: 24,
  font: '15px sans-serif',
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  controls: { padding: spacing.xl },
});
