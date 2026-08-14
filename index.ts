// URL polyfill FIRST, before anything else loads: Hermes/React Native's
// built-in URL is a stub that throws, and the Convex client runs
// `new URL(deploymentUrl)` at construction — without this polyfill the app
// black-screens on launch in native builds (App Review 2.1(a), build #8).
// The /auto entry is a no-op on web.
import 'react-native-url-polyfill/auto';
import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
