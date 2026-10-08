const { withInfoPlist } = require('@expo/config-plugins');

/**
 * iOS background modes for activity recording — exactly two, both in use:
 *  - `location`: keep recording GPS with the screen locked;
 *  - `audio`:    speak the per-km voice cues while the screen is locked.
 * expo-task-manager is auto-applied by prebuild as a legacy plugin and adds
 * `fetch`, which Kasya never uses — App Review (2.5.4) expects every declared
 * background mode to be used, so it's stripped. expo-audio's own plugin is
 * deliberately NOT used: it adds a microphone permission + Android media
 * service we don't need (Kasya only speaks, never records).
 */
module.exports = function withActivityBackgroundModes(config) {
  return withInfoPlist(config, (cfg) => {
    const modes = new Set(Array.isArray(cfg.modResults.UIBackgroundModes) ? cfg.modResults.UIBackgroundModes : []);
    modes.delete('fetch');
    modes.add('location');
    modes.add('audio');
    cfg.modResults.UIBackgroundModes = [...modes];
    return cfg;
  });
};
