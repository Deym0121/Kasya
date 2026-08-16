// NOTE: no URL polyfill here, on purpose. Expo SDK 56's runtime installs a
// spec-compliant URL/URLSearchParams itself, the Convex client doesn't call
// `new URL` at construction, and react-native-url-polyfill's own module scope
// touches legacy NativeModules as the first statement of the bundle — a launch
// risk with zero benefit (it was briefly added while chasing the build-8 black
// screen; the real cause was the camera chain's module-scope require).
import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
