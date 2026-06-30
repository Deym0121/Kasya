// @ts-nocheck
//
// Device-only gait scan: real on-device camera + BlazePose skeleton + landmark
// capture. Metro bundles this ONLY for native, and it only RUNS in the StrideFit
// custom dev build (not Expo Go / web — those resolve PoseScanScreen.tsx).
//
// Types are suppressed (@ts-nocheck) because the native camera/pose/skia modules
// can't be type-verified in this headless environment. The data contract that
// matters — toPoseFrame() turning landmarks into the gait engine's input — IS
// unit-tested in src/gait/__tests__/poseMapper.test.ts.
//
// API verified against react-native-mediapipe-posedetection README:
//   usePoseDetection(callbacks, runningMode, model, options) ->
//     { frameProcessor, cameraViewLayoutChangeHandler }
//   onResults(result) where result.landmarks: Landmark[][] (pose -> 33 landmarks,
//   each { x, y, z, visibility?, presence? } normalized 0..1, BlazePose order).
import { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { usePoseDetection, RunningMode, Delegate } from 'react-native-mediapipe-posedetection';
import { Canvas, Line as SkLine, Circle as SkCircle, vec } from '@shopify/react-native-skia';
import { colors, spacing, fonts, radius } from '../theme';
import { Button } from '../components';
import { toPoseFrame } from '../gait';

// BlazePose indices — identical to the gait engine's LANDMARK map (leg + foot).
const HIP_L = 23, HIP_R = 24, KNEE_L = 25, KNEE_R = 26, ANK_L = 27, ANK_R = 28;
const HEEL_L = 29, HEEL_R = 30, FOOT_L = 31, FOOT_R = 32;
const LEG_LINES = [
  [HIP_L, KNEE_L], [KNEE_L, ANK_L], [ANK_L, HEEL_L], [HEEL_L, FOOT_L], [ANK_L, FOOT_L],
  [HIP_R, KNEE_R], [KNEE_R, ANK_R], [ANK_R, HEEL_R], [HEEL_R, FOOT_R], [ANK_R, FOOT_R],
  [HIP_L, HIP_R],
];
const KEYPOINTS = [HIP_L, KNEE_L, ANK_L, HEEL_L, FOOT_L, HIP_R, KNEE_R, ANK_R, HEEL_R, FOOT_R];
const CAPTURE_MS = 10000;
const visible = (p) => p && (p.visibility ?? p.presence ?? 1) > 0.5;

export default function PoseScanScreen({ navigation, route }) {
  const { goal } = route.params;
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();

  const [size, setSize] = useState({ w: 1, h: 1 });
  const [landmarks, setLandmarks] = useState(null); // latest pose: array of 33 landmarks
  const [recording, setRecording] = useState(false);

  const capturing = useRef(false);
  const startedAt = useRef(0);
  const frames = useRef([]); // PoseFrame[]

  const pose = usePoseDetection(
    {
      onResults: (result) => {
        const lm = result?.landmarks?.[0];
        if (!lm) return;
        setLandmarks(lm); // drives the skeleton overlay (~15fps on the JS thread)
        if (capturing.current) {
          frames.current.push(toPoseFrame(lm, Date.now() - startedAt.current));
        }
      },
      onError: () => {},
    },
    RunningMode.LIVE_STREAM,
    'pose_landmarker_lite.task',
    { numPoses: 1, minPoseDetectionConfidence: 0.5, delegate: Delegate.GPU },
  );

  const startCapture = useCallback(() => {
    frames.current = [];
    startedAt.current = Date.now();
    capturing.current = true;
    setRecording(true);
    setTimeout(() => {
      capturing.current = false;
      setRecording(false);
      // Hand the captured landmark time-series to the existing Processing screen,
      // which runs LivePoseGaitEngine -> analyzeGait -> Result. No video is kept.
      navigation.replace('Processing', { goal, frames: frames.current });
    }, CAPTURE_MS);
  }, [goal, navigation]);

  if (!hasPermission) {
    return (
      <View style={styles.perm}>
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permBody}>
          StrideFit uses your camera to track your stride on-device. Nothing is recorded or uploaded.
        </Text>
        <View style={{ height: spacing.xl }} />
        <Button label="Allow camera" icon="camera" onPress={requestPermission} />
      </View>
    );
  }
  if (device == null) {
    return (
      <View style={styles.perm}>
        <Text style={styles.permTitle}>No camera found</Text>
      </View>
    );
  }

  // Map a normalized landmark (0..1) to overlay pixels. Assumes the preview fills
  // the view; exact cover-crop / front-camera-mirror mapping is tuned on-device.
  const X = (p) => p.x * size.w;
  const Y = (p) => p.y * size.h;

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        frameProcessor={pose.frameProcessor}
        onLayout={pose.cameraViewLayoutChangeHandler}
      />

      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        {landmarks &&
          LEG_LINES.map(([a, b], i) =>
            visible(landmarks[a]) && visible(landmarks[b]) ? (
              <SkLine
                key={`l${i}`}
                p1={vec(X(landmarks[a]), Y(landmarks[a]))}
                p2={vec(X(landmarks[b]), Y(landmarks[b]))}
                color="#39FF14"
                strokeWidth={6}
              />
            ) : null,
          )}
        {landmarks &&
          KEYPOINTS.map((k, i) =>
            visible(landmarks[k]) ? (
              <SkCircle key={`c${i}`} cx={X(landmarks[k])} cy={Y(landmarks[k])} r={7} color="#FF3B30" />
            ) : null,
          )}
      </Canvas>

      <View style={styles.top} pointerEvents="box-none">
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.back}>
          <Text style={styles.backText}>Close</Text>
        </Pressable>
        <Text style={styles.hint}>
          {recording ? 'Recording — walk naturally' : 'Stand side-on, full body in frame'}
        </Text>
      </View>

      <View style={styles.bottom} pointerEvents="box-none">
        <Button
          label={recording ? 'Recording…' : 'Record 10 seconds'}
          icon="camera"
          variant="accent"
          onPress={startCapture}
          disabled={recording}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  perm: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  permTitle: { fontFamily: fonts.bold, fontSize: 20, color: colors.ink },
  permBody: { fontFamily: fonts.regular, fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: spacing.sm },
  top: { position: 'absolute', top: 48, left: spacing.xl, right: spacing.xl, alignItems: 'center' },
  back: { position: 'absolute', left: 0, top: 0 },
  backText: { fontFamily: fonts.semibold, color: '#fff', fontSize: 15 },
  hint: {
    fontFamily: fonts.medium,
    color: '#fff',
    fontSize: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  bottom: { position: 'absolute', left: spacing.xl, right: spacing.xl, bottom: 40 },
});
