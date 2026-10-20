const { withInfoPlist } = require('@expo/config-plugins');

/**
 * iOS background modes for activity recording — exactly one, in use:
 *  - `location`: keep recording GPS with the screen locked.
 * No `audio`: App Review rejected 1.3 (34) under 2.5.4 because spoken per-km
 * cues aren't "persistent audio" — cues now play only while Kasya is on
 * screen (src/activity/voiceCues.ts), so the mode is removed here, and also
 * stripped if any other plugin adds it.
 * expo-task-manager is auto-applied by prebuild as a legacy plugin and adds
 * `fetch`, which Kasya never uses — App Review (2.5.4) expects every declared
 * background mode to be used, so it's stripped too.
 */
module.exports = function withActivityBackgroundModes(config) {
  return withInfoPlist(config, (cfg) => {
    const modes = new Set(Array.isArray(cfg.modResults.UIBackgroundModes) ? cfg.modResults.UIBackgroundModes : []);
    modes.delete('fetch');
    modes.delete('audio');
    modes.add('location');
    cfg.modResults.UIBackgroundModes = [...modes];
    return cfg;
  });
};
