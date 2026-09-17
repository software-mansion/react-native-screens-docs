// TypeDoc configuration — the JS/TS API reference is generated from the library's in-code
// TSDoc comments, not hand-written.
//
// The library lives in a sibling checkout (`../react-native-screens`) which must be
// `yarn install`ed: TypeDoc type-checks the real program, so react-native's types have to
// resolve. Generation is an explicit, committed step driven by `yarn gen:api`
// (scripts/gen-api.mjs) — NOT a Docusaurus plugin, so a docs build never depends on the
// library being present.
//
// This file is the setup only: one TypeDoc instance, the markdown renderer, output into a
// scratch directory. Where those pages land in `docs/` and how they look are separate
// concerns (a custom router and theme, added later).

/** @type {Partial<import('typedoc').TypeDocOptions>} */
export default {
  // The public surface, entry point per feature barrel plus the shared vocabulary in
  // `src/types.ts`. One instance over all of them means a single project, so a `{@link}`
  // from one feature to a type of another resolves on its own.
  entryPoints: [
    '../react-native-screens/src/components/tabs/index.ts',
    '../react-native-screens/src/components/stack/index.ts',
    '../react-native-screens/src/components/split/index.ts',
    '../react-native-screens/src/components/safe-area/index.ts',
    '../react-native-screens/src/components/scroll-view-marker/index.ts',
    '../react-native-screens/src/components/scroll-to-top-guard/index.ts',
    '../react-native-screens/src/components/modals/form-sheet/index.ts',
    '../react-native-screens/src/types.ts',
  ],
  // Each entry point is a module of one unified project → shared symbol resolution.
  entryPointStrategy: 'resolve',
  // The library's own tsconfig: it resolves react-native's exports map itself
  // (`moduleResolution: bundler`) and the program type-checks clean under it, so no
  // docs-specific tsconfig is needed.
  tsconfig: '../react-native-screens/tsconfig.json',
  // `src/fabric/**` holds codegen specs that duplicate public types (the PlatformIcon*
  // family among them) and would collide with the canonical declarations.
  exclude: ['**/fabric/**'],
  // `SplitHostProps` and `SafeAreaViewProps` extend react-native's `ViewProps`; documenting
  // externals would flood those pages with ~100 inherited RN props each. Only the library's
  // own surface is documented.
  excludeExternals: true,

  plugin: ['typedoc-plugin-markdown'],
  // Scratch output: this PR only proves the pipeline runs. The pages are not part of the
  // site yet and the directory is git-ignored; the router that writes into `docs/` lands
  // separately.
  out: 'docs/_api_scratch',
  cleanOutputDir: true,
  readme: 'none',
};
