// @ts-nocheck
//
// Native dispatcher. The real camera screen imports native modules that DO NOT
// exist in Expo Go, so we must not even load it there. The require is also
// GUARDED: vision-camera / the pose plugin THROW at require time when their
// native side isn't registered (missing frame-processor plugin, unavailable
// worklets, unregistered TurboModule), and an unguarded module-scope throw
// kills the entire bundle before the app mounts — a black screen at launch
// with no error UI possible (App Review 2.1(a), builds 8-9). A broken camera
// stack must degrade to the simulated scan, never take down the app.
import Constants from 'expo-constants';
import SimulatedScanScreen from './SimulatedScanScreen';

const isExpoGo = Constants.appOwnership === 'expo';
let RealCamera = null;
if (!isExpoGo) {
  try {
    RealCamera = require('./PoseScanCamera').default;
  } catch (e) {
    console.warn('[Kasya] real camera unavailable — falling back to simulated scan', e);
  }
}

export default function PoseScanScreen(props) {
  const Screen = RealCamera || SimulatedScanScreen;
  return <Screen {...props} />;
}
