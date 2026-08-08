// @ts-nocheck
//
// Real gait scan on the WEB: runs MediaPipe BlazePose on the webcam, draws the
// live skeleton, records the landmark time-series, and — only if it captured a
// usable walk — hands it to the tested gait engine (via Processing). If nothing
// usable was recorded (no camera, no person, not enough walking), it does NOT
// advance; it explains why and lets you try again.
import { useRef, useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '../theme';
import { Button } from '../components';
import { toPoseFrame, analyzeGait, assessFrontalQuality } from '../gait';
import { BODY_GUIDE, BODY_GUIDE_VIEWBOX } from '../viz/bodyGuide';
import { setPendingVideo, clearPendingVideo } from '../viz/videoHolder';
import { REAR_GUIDE_STEPS } from './CameraGuideScreen';

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
    s.onerror = () => {
      // A failed load must not poison the cache: drop the promise AND the dead
      // script element so "Try again" performs a genuinely fresh load.
      visionPromise = null;
      try {
        s.remove();
        delete window[cb];
      } catch {}
      reject(new Error('Could not load the pose model code'));
    };
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
  // Side frames captured this session (for chaining the rear pass in-screen), or
  // handed in via navigation when this screen was opened directly for the rear view.
  const sideFramesRef = useRef(route.params.sideFrames || null);

  const [view, setView] = useState(route.params.view || 'side'); // 'side' | 'rear'
  const [status, setStatus] = useState('loading'); // loading | ready | counting | recording | error
  const [msg, setMsg] = useState('Loading pose model…');
  const [count, setCount] = useState(CAPTURE_SECONDS);
  const [leadIn, setLeadIn] = useState(3); // "get ready" countdown, seconds
  const [detected, setDetected] = useState(false);
  const [retryMsg, setRetryMsg] = useState('');
  const [choice, setChoice] = useState(false); // after a good SIDE capture: add rear or analyze now
  const [recordVideo, setRecordVideo] = useState(false); // opt-in ephemeral clip
  const [nonce, setNonce] = useState(0);
  const timerRef = useRef(null); // active countdown / capture interval
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recordVideoRef = useRef(false);
  // Resolves once the last stopVideo() has fully settled (clip stashed or
  // dropped) — awaited before navigating so Processing's tag can't win a race.
  const stopPromiseRef = useRef(Promise.resolve());
  useEffect(() => {
    recordVideoRef.current = recordVideo;
  }, [recordVideo]);

  // Never leave an interval running after the screen unmounts (e.g. Close mid-count).
  useEffect(() => () => timerRef.current && clearInterval(timerRef.current), []);

  // Opt-in clip: record the raw camera to an in-memory blob DURING the side
  // capture only. Never written to disk, never uploaded. Kept only if the capture
  // passes the gate; the Review screen deletes it right after.
  const startVideo = useCallback(() => {
    const s = streamRef.current;
    if (!s || !recordVideoRef.current) return;
    try {
      if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder unavailable');
      chunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm';
      const rec = new MediaRecorder(s, { mimeType: mime });
      rec.ondataavailable = (e) => e.data && e.data.size && chunksRef.current.push(e.data);
      rec.start();
      recorderRef.current = rec;
    } catch {
      // No new clip started → a stale one must never get tagged to this report.
      clearPendingVideo();
    }
  }, []);
  // Resolves after onstop has run (clip stashed / chunks cleared) — or right
  // away after cleanup if stop() throws, so callers can safely await it.
  const stopVideo = useCallback((keep) => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (!rec) return Promise.resolve();
    return new Promise((resolve) => {
      rec.onstop = () => {
        if (keep && chunksRef.current.length) {
          const blob = new Blob(chunksRef.current, { type: rec.mimeType });
          setPendingVideo(URL.createObjectURL(blob));
        }
        chunksRef.current = [];
        resolve();
      };
      try {
        rec.stop();
      } catch {
        chunksRef.current = []; // onstop never fires — don't strand the raw bytes
        resolve();
      }
    });
  }, []);

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
    setRetryMsg(''); // "Try again" (nonce bump) must not resurrect a stale gate-failure banner
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
        streamRef.current = stream;
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
      if (recorderRef.current) {
        try {
          recorderRef.current.stop();
        } catch {}
        recorderRef.current = null;
        chunksRef.current = [];
      }
      if (stream) stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (lmRef.current && lmRef.current.close) lmRef.current.close();
      lmRef.current = null;
    };
  }, [render, nonce]);

  // The actual 10s capture — runs only after the "get ready" countdown.
  const beginCapture = useCallback(() => {
    framesRef.current = [];
    startRef.current = performance.now();
    capturingRef.current = true;
    setStatus('recording');
    if (view === 'side') {
      if (recordVideoRef.current) startVideo(); // opt-in clip records over the side pass
      else clearPendingVideo(); // a non-video scan must not inherit a stale clip
    }
    let n = CAPTURE_SECONDS;
    setCount(n);
    timerRef.current = setInterval(() => {
      n -= 1;
      setCount(n);
      if (n <= 0) {
        clearInterval(timerRef.current);
        capturingRef.current = false;
        const frames = framesRef.current;
        // GATE: only advance when we actually recorded an analyzable walk. The
        // side view is gated on cadence/quality; the rear view on frontal quality.
        const gate =
          view === 'rear'
            ? assessFrontalQuality(frames)
            : analyzeGait(frames).captureQuality;
        if (!gate.ok) {
          if (view === 'side') stopPromiseRef.current = stopVideo(false); // discard the clip on a failed capture
          setStatus('ready');
          setRetryMsg(
            gate.issues[0] ||
              (view === 'rear'
                ? 'We couldn’t read the rear view. Face away, stay fully in frame, and walk the whole time.'
                : 'We couldn’t read your stride. Stay fully in frame and walk for the whole ten seconds.'),
          );
          return;
        }
        if (view === 'rear') {
          // Second pass done → one merged report from both angles. (Let any
          // side-pass clip settle first so Processing's tag can't beat it.)
          const side = sideFramesRef.current || undefined;
          stopPromiseRef.current.then(() =>
            navigation.replace('Processing', { goal, frames: side, frontalFrames: frames }),
          );
        } else {
          // Side pass done → keep the clip (if any), and offer the optional rear view.
          stopPromiseRef.current = stopVideo(true);
          sideFramesRef.current = frames;
          setStatus('ready');
          setChoice(true);
        }
      }
    }, 1000);
  }, [goal, navigation, view, startVideo, stopVideo]);

  // Tap Record → a short "get ready" countdown (3/5/10s) → beginCapture().
  const record = useCallback(() => {
    setRetryMsg('');
    if (timerRef.current) clearInterval(timerRef.current);
    if (leadIn <= 0) {
      beginCapture();
      return;
    }
    let c = leadIn;
    setCount(c);
    setStatus('counting');
    timerRef.current = setInterval(() => {
      c -= 1;
      if (c <= 0) {
        clearInterval(timerRef.current);
        beginCapture();
      } else {
        setCount(c);
      }
    }, 1000);
  }, [leadIn, beginCapture]);

  // Switch to the rear pass without tearing down the loaded model/camera.
  const startRearPass = useCallback(() => {
    setChoice(false);
    setRetryMsg('');
    framesRef.current = [];
    setView('rear');
    setStatus('ready');
  }, []);

  const analyzeNow = useCallback(async () => {
    setChoice(false);
    await stopPromiseRef.current; // the clip (if any) settles before Processing tags it
    navigation.replace('Processing', { goal, frames: sideFramesRef.current || undefined });
  }, [goal, navigation]);

  const rear = view === 'rear';
  const walkHint = rear ? 'walk away from the camera' : 'walk side-on';

  let buttonLabel = rear ? `Record rear view · ${CAPTURE_SECONDS}s` : `Record ${CAPTURE_SECONDS} seconds`;
  let buttonIcon = 'camera';
  let buttonDisabled = false;
  let onPress = record;
  if (choice) {
    buttonDisabled = true; // the choice overlay owns the next action
  } else if (status === 'loading') {
    buttonLabel = 'Loading…';
    buttonDisabled = true;
  } else if (status === 'error') {
    buttonLabel = 'Try again';
    buttonIcon = 'refresh-ccw';
    onPress = () => setNonce((x) => x + 1);
  } else if (status === 'counting') {
    buttonLabel = `Starting in ${count}…`;
    buttonDisabled = true;
  } else if (status === 'recording') {
    buttonLabel = `Recording… ${count}s`;
    buttonDisabled = true;
  } else if (status === 'ready' && !detected) {
    buttonLabel = 'Step fully into frame';
    buttonDisabled = true;
  }

  const topText = choice
    ? '✓ Side view captured'
    : status === 'counting'
      ? `Get ready — ${walkHint} when it hits 0`
      : status === 'recording'
      ? `Recording — ${count}s · ${walkHint}`
      : status === 'ready'
        ? retryMsg
          ? retryMsg
          : rear
            ? detected
              ? '✓ In frame — press Record and walk away'
              : 'Face away and line up with the outline — whole body in frame'
            : detected
              ? '✓ You’re in frame — press Record and walk'
              : 'Line up with the outline — step back so your whole body shows'
        : '';

  return (
    <View style={styles.screen}>
      <div style={stageStyle}>
        <video ref={videoRef} autoPlay playsInline muted style={videoStyle} />
        <canvas ref={canvasRef} style={canvasStyle} />
        {status === 'ready' || status === 'counting' ? (
          <svg viewBox={BODY_GUIDE_VIEWBOX} preserveAspectRatio="xMidYMid meet" style={guideStyle} aria-hidden="true">
            <circle
              cx={BODY_GUIDE.head.cx}
              cy={BODY_GUIDE.head.cy}
              r={BODY_GUIDE.head.r}
              fill="none"
              stroke={detected ? '#39FF14' : 'rgba(255,255,255,0.55)'}
              strokeWidth={4}
              strokeDasharray="6 8"
            />
            {BODY_GUIDE.lines.map((l, i) => (
              <line
                key={i}
                x1={l[0]}
                y1={l[1]}
                x2={l[2]}
                y2={l[3]}
                stroke={detected ? '#39FF14' : 'rgba(255,255,255,0.55)'}
                strokeWidth={4}
                strokeLinecap="round"
                strokeDasharray="6 8"
              />
            ))}
          </svg>
        ) : null}
        {/* While the choice overlay is up, Close = analyze now — a passed capture is never discarded. */}
        <div
          onClick={() => (choice ? analyzeNow() : navigation.goBack())}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (choice ? analyzeNow() : navigation.goBack())}
          role="button"
          tabIndex={0}
          aria-label={choice ? 'Dismiss and analyze the side view only' : 'Close the scan'}
          style={closeStyle}
        >
          ✕ Close
        </div>
        {topText ? (
          // retry tint = dark danger scrim (white HUD text stays readable over video)
          <div style={{ ...hintStyle, background: retryMsg ? 'rgba(140,43,36,0.92)' : 'rgba(0,0,0,0.5)' }}>
            {topText}
          </div>
        ) : null}
        {/* Rear pass just started → brief positioning guidance (shared with CameraGuide's rear copy). */}
        {rear && status === 'ready' && !choice && !retryMsg ? (
          <div style={rearHintStyle}>{REAR_GUIDE_STEPS.slice(0, 2).join(' ')}</div>
        ) : null}
        {status === 'loading' || status === 'error' ? <div style={msgStyle}>{msg}</div> : null}
        {status === 'counting' ? <div style={countdownStyle}>{count}</div> : null}
        {status === 'recording' ? <div style={recDot} /> : null}
        {choice ? (
          <div style={choiceStyle}>
            {/* Dismiss = analyze the side view — a passed capture is never discarded. */}
            <div
              onClick={analyzeNow}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && analyzeNow()}
              role="button"
              tabIndex={0}
              aria-label="Dismiss and analyze the side view only"
              style={choiceClose}
            >
              ✕
            </div>
            <div style={choiceTitle}>Add a rear view?</div>
            <div style={choiceText}>
              A second pass from behind adds hip level, base of support and left/right balance — folded
              into the same result.
            </div>
            <div
              onClick={startRearPass}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && startRearPass()}
              role="button"
              tabIndex={0}
              style={choicePrimary}
            >
              + Add rear view
            </div>
            <div
              onClick={analyzeNow}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && analyzeNow()}
              role="button"
              tabIndex={0}
              style={choiceSecondary}
            >
              Analyze side view only
            </div>
          </div>
        ) : null}
      </div>
      <View style={styles.controls}>
        {status === 'ready' && !choice ? (
          <View style={styles.leadRow}>
            <Text style={styles.leadLabel}>Get ready</Text>
            {[3, 5, 10].map((s) => (
              <Pressable
                key={s}
                onPress={() => setLeadIn(s)}
                accessibilityRole="button"
                accessibilityLabel={`Get-ready countdown ${s} seconds`}
                accessibilityState={{ selected: leadIn === s }}
                style={[styles.leadChip, leadIn === s && styles.leadChipOn]}
              >
                <Text style={[styles.leadChipText, leadIn === s && styles.leadChipTextOn]}>{s}s</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {status === 'ready' && !choice && view === 'side' ? (
          <Pressable style={styles.vidToggle} onPress={() => setRecordVideo((v) => !v)} accessibilityRole="switch" accessibilityState={{ checked: recordVideo }}>
            <View style={[styles.check, recordVideo && styles.checkOn]}>
              {recordVideo ? <Feather name="check" size={14} color={colors.onDark} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.vidTitle}>Record my video (just this once)</Text>
              <Text style={styles.vidSub}>Shown only in your review, then deleted. Never uploaded.</Text>
            </View>
          </Pressable>
        ) : null}
        {/* The rear pass is optional — always leave a clearly-labeled way out
            that analyzes the side view already in hand. */}
        {rear && !choice && status !== 'recording' && status !== 'counting' && sideFramesRef.current ? (
          <Pressable
            style={styles.skipRear}
            onPress={analyzeNow}
            accessibilityRole="button"
            accessibilityLabel="Skip the rear view and analyze the side view"
          >
            <Text style={styles.skipRearText}>Skip rear — analyze side view</Text>
          </Pressable>
        ) : null}
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
const guideStyle = { position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none' };
// DOM inline styles — plain JS objects, so the theme tokens drop straight in.
const closeStyle = {
  position: 'absolute',
  top: 14,
  left: spacing.lg,
  color: colors.onDark,
  font: `600 15px ${fonts.semibold}, sans-serif`,
  cursor: 'pointer',
  textShadow: '0 1px 3px rgba(0,0,0,0.6)',
  zIndex: 2,
};
const hintStyle = {
  position: 'absolute',
  top: 48,
  left: spacing.lg,
  right: spacing.lg,
  textAlign: 'center',
  color: colors.onDark,
  font: `600 14px ${fonts.semibold}, sans-serif`,
  padding: `${spacing.sm}px ${spacing.md}px`,
  borderRadius: radius.pill,
  zIndex: 2,
};
const rearHintStyle = {
  position: 'absolute',
  top: 96,
  left: spacing.lg,
  right: spacing.lg,
  textAlign: 'center',
  color: 'rgba(255,255,255,0.85)',
  font: `500 13px ${fonts.medium}, sans-serif`,
  background: 'rgba(0,0,0,0.45)',
  padding: `${spacing.sm}px ${spacing.md}px`,
  borderRadius: radius.md,
  zIndex: 2,
};
const msgStyle = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: colors.onDark,
  textAlign: 'center',
  padding: spacing.xl,
  font: `15px ${fonts.regular}, sans-serif`,
};
const recDot = {
  position: 'absolute',
  top: 16,
  right: 16,
  width: 14,
  height: 14,
  borderRadius: 7,
  background: colors.danger,
  zIndex: 2,
};
const choiceStyle = {
  position: 'absolute',
  left: spacing.lg,
  right: spacing.lg,
  bottom: spacing.lg,
  background: 'rgba(30,32,38,0.92)', // colors.surfaceAlt (#1E2026) at 92% — stays translucent over video
  border: `1px solid ${colors.lineStrong}`,
  borderRadius: radius.lg,
  padding: spacing.lg,
  zIndex: 3,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};
const choiceClose = {
  position: 'absolute',
  top: 10,
  right: 14,
  color: colors.onDarkMuted,
  font: `600 16px ${fonts.semibold}, sans-serif`,
  cursor: 'pointer',
  padding: 6,
};
const choiceTitle = { color: colors.onDark, font: `700 17px ${fonts.bold}, sans-serif` };
const choiceText = {
  color: 'rgba(255,255,255,0.75)',
  font: `14px ${fonts.regular}, sans-serif`,
  lineHeight: 1.4,
};
const choicePrimary = {
  marginTop: 4,
  textAlign: 'center',
  color: colors.onDark,
  background: colors.accent,
  font: `700 15px ${fonts.bold}, sans-serif`,
  padding: `${spacing.md}px ${spacing.lg}px`,
  borderRadius: radius.pill,
  cursor: 'pointer',
};
const choiceSecondary = {
  textAlign: 'center',
  color: colors.onDark,
  font: `600 15px ${fonts.semibold}, sans-serif`,
  padding: `10px ${spacing.lg}px`,
  borderRadius: radius.pill,
  cursor: 'pointer',
  border: '1px solid rgba(255,255,255,0.25)',
};
const countdownStyle = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#fff',
  font: `800 140px ${fonts.extra}, sans-serif`,
  textShadow: '0 4px 24px rgba(0,0,0,0.6)',
  zIndex: 2,
  pointerEvents: 'none',
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  controls: { padding: spacing.xl },
  leadRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  leadLabel: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted, marginRight: spacing.md },
  leadChip: {
    minHeight: 40,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
  },
  leadChipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  leadChipText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.inkSoft },
  leadChipTextOn: { color: colors.bg },
  vidToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    marginBottom: spacing.md,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  vidTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  vidSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 1 },
  skipRear: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  skipRearText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.inkSoft },
});
