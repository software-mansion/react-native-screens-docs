// Generates the API reference from the library's TSDoc comments; run by `yarn gen:api`.
// Reads the library checkout `LIB_REPO` (the sibling one unless `gen:api --ref` / `--lib`
// names another), which must be `yarn install`ed.
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
  // gen-api.mjs passes `--out`, a temporary folder whose families it moves into `docs` after
  // its checks; run TypeDoc through it. On its own TypeDoc would write into `docs`, which it
  // must not clean: hand-written pages live there.
  out: 'docs',
  cleanOutputDir: false,
  readme: 'none',
  // A clean run has no warnings, so any is a mistake in the library's comments or exports: a
  // second `@remarks` or `@returns`, a tag the library's tsdoc.json does not declare, a public
  // type that uses one nobody exports.
  treatWarningsAsErrors: true,
  // A source "link" is only the declaration's file in the library and its line, `src/…#L12`.
  // ReferenceHeading puts the repository and the commit from api-reference.lock.json in front,
  // so regenerating from another commit changes the lock and the lines that moved, not every
  // link. With a template TypeDoc does not read the checkout's git remote, so a fork as
  // `origin` changes nothing; without git it links every file, also in a checkout whose `.git`
  // is a file (a worktree), and does not use git's list of tracked files.
  // `{path}` is relative to `displayBasePath` (without it, to the folder all entry points share,
  // which moves when they do). TypeDoc also names the modules relative to it, so it is `src`
  // (`components/tabs`, as the feature map keys them), and the template adds `src/` back.
  disableGit: true,
  displayBasePath: `${LIB_REPO}/src`,
  sourceLinkTemplate: 'src/{path}#L{line}',
};
