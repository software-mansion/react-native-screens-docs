// Generates the API reference from the library's TSDoc comments; run by `yarn gen:api`.
// Reads the sibling checkout (`LIB_REPO`), which must be `yarn install`ed.
// The generator's .mts files are loaded as they are: Node strips their types.
// This file stays .mjs: TypeDoc does not read a .ts config.

import { entryPoints, LIB_REPO } from './plugins/typedoc-rns/feature-map.mts';

/** @type {Partial<import('typedoc').TypeDocOptions>} */
export default {
  entryPoints,
  // One project over all entry points, so a `{@link}` across features resolves on its own.
  entryPointStrategy: 'resolve',
  tsconfig: `${LIB_REPO}/tsconfig.json`,
  // Codegen specs that duplicate public types (the PlatformIcon* family) and would collide.
  exclude: ['**/fabric/**'],
  // Without this, `ViewProps` alone adds ~100 inherited react-native props to Split/SafeArea.
  excludeExternals: true,
  // `@experimental` shows on the symbols that carry it, not on every member of a tagged type.
  cascadedModifierTags: [],

  plugin: ['typedoc-plugin-markdown', './plugins/typedoc-rns/index.mts'],
  router: 'rns',
  theme: 'rns',
  // The assembling file imports its parts, and later PRs put React components on the pages.
  fileExtension: '.mdx',
  // MDX reads `<`, `{` and friends as syntax, so comment text has to be escaped.
  sanitizeComments: true,
  // Declarations as ```ts blocks, with object literals and parameters written out.
  useCodeBlocks: true,
  expandObjects: true,
  expandParameters: true,
  // TypeDoc's own page chrome links to pages this router does not write (module indexes).
  hidePageHeader: true,
  hideBreadcrumbs: true,
  // The router writes into the docs tree itself; gen-api.mjs owns the targeted wipe, so
  // TypeDoc must never clean the whole directory.
  out: 'docs',
  cleanOutputDir: false,
  readme: 'none',
  // Source links point at the library's `main`, so they do not change with every new commit
  // of the library; the line numbers come from the checkout the reference is generated from.
  gitRevision: 'main',
};
