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

  plugin: ['typedoc-plugin-markdown', './plugins/typedoc-rns/index.mjs'],
  router: 'rns',
  theme: 'rns',
  // The assembling file imports its parts, and later PRs put React components on the pages.
  fileExtension: '.mdx',
  // MDX reads `<`, `{` and friends as syntax, so comment text has to be escaped.
  sanitizeComments: true,
  // TypeDoc's own page chrome links to pages this router does not write (module indexes).
  hidePageHeader: true,
  hideBreadcrumbs: true,
  // The router writes into the docs tree itself; gen-api.mjs owns the targeted wipe, so
  // TypeDoc must never clean the whole directory.
  out: 'docs',
  cleanOutputDir: false,
  readme: 'none',
};
