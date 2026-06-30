// @ts-nocheck
//
// Native dispatcher. The real camera screen imports native modules that DO NOT
// exist in Expo Go, so we must not even load it there. We detect Expo Go and
// only `require` the real camera in a custom dev build.
import Constants from 'expo-constants';
import SimulatedScanScreen from './SimulatedScanScreen';

const isExpoGo = Constants.appOwnership === 'expo';
const RealCamera = isExpoGo ? null : require('./PoseScanCamera').default;

export default function PoseScanScreen(props) {
  const Screen = RealCamera || SimulatedScanScreen;
  return <Screen {...props} />;
}
