// Generates the API reference from the library's TSDoc comments; run by `yarn gen:api`.
// Reads the sibling checkout `../react-native-screens`, which must be `yarn install`ed.

import { entryPoints } from './plugins/typedoc-rns/feature-map.mjs';

/** @type {Partial<import('typedoc').TypeDocOptions>} */
export default {
  entryPoints,
  // One project over all entry points, so a `{@link}` across features resolves on its own.
  entryPointStrategy: 'resolve',
  tsconfig: '../react-native-screens/tsconfig.json',
  // Codegen specs that duplicate public types (the PlatformIcon* family) and would collide.
  exclude: ['**/fabric/**'],
  // Without this, `ViewProps` alone adds ~100 inherited react-native props to Split/SafeArea.
  excludeExternals: true,

  plugin: ['typedoc-plugin-markdown'],
  // Scratch output until the router writes into `docs/` (git-ignored, not part of the site).
  out: 'docs/_api_scratch',
  cleanOutputDir: true,
  readme: 'none',
};
