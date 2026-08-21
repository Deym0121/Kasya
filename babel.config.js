// Required by react-native-vision-camera v4 frame processors: the worklets-core
// babel plugin turns 'worklet' directives into real worklets. Without it the
// frame processor is a plain function and Camera mount throws on device
// (BUILD_NATIVE.md step 1 — was never wired on this branch).
// Do NOT add react-native-reanimated/plugin or react-native-worklets/plugin:
// the dual-worklets-runtime conflict was resolved by removing reanimated.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets-core/plugin'],
  };
};
