// @ts-nocheck
//
// Real gait scan on the WEB: runs MediaPipe BlazePose on the webcam, draws the
// live skeleton, records the landmark time-series, and — only if it captured a
// usable walk — hands it to the tested gait engine (via Processing). If nothing
// usable was recorded (no camera, no person, not enough walking), it does NOT
// advance; it explains why and lets you try again.
import { useRef, useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, spacing } from '../theme';
import { Button } from '../components';
import { toPoseFrame, analyzeGait } from '../gait';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const VISION_ESM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/+esm';

const LINES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
];
const CAPTURE_SECONDS = 10;

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

function friendlyError(e) {
  const name = e && e.name;
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Camera access was blocked. Allow the camera in your browser, then tap Try again.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError')
    return 'No camera found. Connect a webcam, then tap Try again.';
  if (name === 'NotReadableError')
    return 'Your camera is in use by another app. Close it, then tap Try again.';
  return String((e && e.message) || e) || 'Camera unavailable.';
}

export default function PoseScanScreen({ navigation, route }) {
  const { goal } = route.params;
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const lmRef = useRef(null);
  const rafRef = useRef(0);
  const framesRef = useRef([]);
  const capturingRef = useRef(false);
  const startRef = useRef(0);
  const detectedRef = useRef(false);

  const [status, setStatus] = useState('loading'); // loading | ready | recording | error
  const [msg, setMsg] = useState('Loading pose model…');
  const [count, setCount] = useState(CAPTURE_SECONDS);
  const [detected, setDetected] = useState(false);
  const [retryMsg, setRetryMsg] = useState('');
  const [nonce, setNonce] = useState(0);

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
      const has = !!pts;
      if (has !== detectedRef.current) {
        detectedRef.current = has;
        setDetected(has);
      }
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
    setStatus('loading');
    setMsg('Loading pose model…');
    detectedRef.current = false;
    setDetected(false);
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
        setMsg(friendlyError(e));
        setStatus('error');
      }
    })();
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (lmRef.current && lmRef.current.close) lmRef.current.close();
      lmRef.current = null;
    };
  }, [render, nonce]);

  const record = useCallback(() => {
    setRetryMsg('');
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
        // GATE: only advance when we actually recorded an analyzable walk.
        const frames = framesRef.current;
        const result = analyzeGait(frames);
        if (!result.captureQuality.ok) {
          setStatus('ready');
          setRetryMsg(
            result.captureQuality.issues[0] ||
              'We couldn’t read your stride. Stay fully in frame and walk for the whole ten seconds.',
          );
          return;
        }
        navigation.replace('Processing', { goal, frames });
      }
    }, 1000);
  }, [goal, navigation]);

  let buttonLabel = `Record ${CAPTURE_SECONDS} seconds`;
  let buttonIcon = 'camera';
  let buttonDisabled = false;
  let onPress = record;
  if (status === 'loading') {
    buttonLabel = 'Loading…';
    buttonDisabled = true;
  } else if (status === 'error') {
    buttonLabel = 'Try again';
    buttonIcon = 'refresh-ccw';
    onPress = () => setNonce((x) => x + 1);
  } else if (status === 'recording') {
    buttonLabel = `Recording… ${count}s`;
    buttonDisabled = true;
  } else if (status === 'ready' && !detected) {
    buttonLabel = 'Step fully into frame';
    buttonDisabled = true;
  }

  const topText =
    status === 'recording'
      ? `Recording — ${count}s · walk side-on`
      : status === 'ready'
        ? retryMsg
          ? retryMsg
          : detected
            ? '✓ You’re in frame — press Record and walk'
            : 'Step back so your whole body is visible'
        : '';

  return (
    <View style={styles.screen}>
      <div style={stageStyle}>
        <video ref={videoRef} autoPlay playsInline muted style={videoStyle} />
        <canvas ref={canvasRef} style={canvasStyle} />
        <div onClick={() => navigation.goBack()} style={closeStyle}>
          ✕ Close
        </div>
        {topText ? (
          <div style={{ ...hintStyle, background: retryMsg ? 'rgba(179,41,15,0.85)' : 'rgba(0,0,0,0.5)' }}>
            {topText}
          </div>
        ) : null}
        {status !== 'ready' && status !== 'recording' ? <div style={msgStyle}>{msg}</div> : null}
        {status === 'recording' ? <div style={recDot} /> : null}
      </div>
      <View style={styles.controls}>
        <Button
          label={buttonLabel}
          icon={buttonIcon}
          variant="accent"
          disabled={buttonDisabled}
          onPress={onPress}
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
  minHeight: 380,
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
  zIndex: 2,
};
const hintStyle = {
  position: 'absolute',
  top: 48,
  left: 16,
  right: 16,
  textAlign: 'center',
  color: '#fff',
  font: '600 14px sans-serif',
  padding: '8px 12px',
  borderRadius: 999,
  zIndex: 2,
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
const recDot = {
  position: 'absolute',
  top: 16,
  right: 16,
  width: 14,
  height: 14,
  borderRadius: 7,
  background: '#FF3B30',
  zIndex: 2,
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  controls: { padding: spacing.xl },
});
