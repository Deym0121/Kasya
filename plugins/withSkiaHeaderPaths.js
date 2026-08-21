const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Fixes the v1.1 EAS build failure: react-native-skia's own base64.cpp does
 * `#include "third_party/base64.h"`, which needs cpp/api on the pod target's
 * HEADER_SEARCH_PATHS. The podspec relies on a recursive `cpp/`** glob that
 * stopped expanding once expo-updates changed the pod graph (build #13,
 * "'third_party/base64.h' file not found"). We append the explicit paths in
 * post_install — additive only, scoped to the skia target.
 */
module.exports = function withSkiaHeaderPaths(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let s = fs.readFileSync(podfile, 'utf8');
      const MARK = '# @kasya: explicit skia header paths (see plugins/withSkiaHeaderPaths.js)';
      if (!s.includes(MARK)) {
        const snippet = [
          '',
          '    ' + MARK,
          "    skia_cpp = File.expand_path(File.join(__dir__, '..', 'node_modules', '@shopify', 'react-native-skia', 'cpp'))",
          "    installer.pods_project.targets.each do |t|",
          "      next unless t.name == 'react-native-skia'",
          '      t.build_configurations.each do |c|',
          "        existing = c.build_settings['HEADER_SEARCH_PATHS']",
          "        list = existing.is_a?(Array) ? existing.dup : [existing || '$(inherited)']",
          '        list << (\'"\' + skia_cpp + \'/api"\')',
          '        list << (\'"\' + skia_cpp + \'"\')',
          "        c.build_settings['HEADER_SEARCH_PATHS'] = list",
          '      end',
          '    end',
        ].join('\n');
        s = s.replace(/post_install do \|installer\|/, 'post_install do |installer|' + snippet);
        if (!s.includes(MARK)) {
          // Fail the prebuild loudly rather than shipping another mystery
          // compile failure: the Podfile template must have changed.
          throw new Error('withSkiaHeaderPaths: post_install anchor not found in the generated Podfile');
        }
        fs.writeFileSync(podfile, s);
      }
      return cfg;
    },
  ]);
};
