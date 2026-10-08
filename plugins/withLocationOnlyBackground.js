const { withInfoPlist } = require('@expo/config-plugins');

/**
 * expo-task-manager is auto-applied by prebuild as a legacy plugin and adds
 * the `fetch` background mode. Kasya never uses background fetch — only the
 * `location` mode, for recording activities with the screen locked — and App
 * Review (2.5.4) expects every declared background mode to be used. Strip it.
 */
module.exports = function withLocationOnlyBackground(config) {
  return withInfoPlist(config, (cfg) => {
    const modes = cfg.modResults.UIBackgroundModes;
    if (Array.isArray(modes)) {
      cfg.modResults.UIBackgroundModes = modes.filter((m) => m !== 'fetch');
    }
    return cfg;
  });
};
