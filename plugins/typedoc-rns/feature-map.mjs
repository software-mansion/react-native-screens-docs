// Which library module becomes which docs page, and which of its types are components.
// The single source of truth for the generator: the TypeDoc config reads the entry points
// from here, and the router and the theme (later PRs) read everything else.
//
// Keyed by TypeDoc module name — the entry point's path relative to the entry points'
// common base, so `src/components/tabs/index.ts` is the module `components/tabs`.
//
// Per family:
//   `dir`        — the docs folder; its API reference is generated into `<dir>/api-reference`
//                  and imported by the hand-written page at `<dir>/index.mdx`.
//   `page`       — instead of `dir` for a family that IS a generated page (Common Types).
//   `components` — the sections of its API reference, in page order. `props` is the
//                  component's public props type: that type's members are the section.
//                  `merged` names reflections that document as part of the section rather
//                  than on their own — the `XPropsBase` interface a props type extends, and
//                  the namespace member (`Tabs.Host`) users actually write.

const LIB = '../react-native-screens/src';

export const FEATURES = {
  'components/stack': {
    entryPoint: `${LIB}/components/stack/index.ts`,
    label: 'Stack',
    dir: 'react/containers/stack',
    components: [
      { id: 'host', label: 'Host', props: 'StackHostProps', merged: ['Host'] },
      { id: 'screen', label: 'Screen', props: 'StackScreenProps', merged: ['Screen'] },
      {
        id: 'header-config',
        label: 'HeaderConfig',
        props: 'StackHeaderConfigProps',
        merged: ['StackHeaderConfigPropsBase', 'HeaderConfig'],
      },
    ],
  },
  'components/tabs': {
    entryPoint: `${LIB}/components/tabs/index.ts`,
    label: 'Tabs',
    dir: 'react/containers/tabs',
    components: [
      {
        id: 'host',
        label: 'Host',
        props: 'TabsHostProps',
        merged: ['TabsHostPropsBase', 'Host'],
      },
      {
        id: 'screen',
        label: 'Screen',
        props: 'TabsScreenProps',
        merged: ['TabsScreenPropsBase', 'Screen'],
      },
    ],
  },
  // Split.Column and Split.Inspector share one props type, so they document as one section.
  'components/split': {
    entryPoint: `${LIB}/components/split/index.ts`,
    label: 'Split',
    dir: 'react/containers/split',
    components: [
      { id: 'host', label: 'Host', props: 'SplitHostProps', merged: ['Host'] },
      {
        id: 'column',
        label: 'Column & Inspector',
        props: 'SplitScreenProps',
        merged: ['Column', 'Inspector'],
      },
    ],
  },
  'components/scroll-to-top-guard': {
    entryPoint: `${LIB}/components/scroll-to-top-guard/index.ts`,
    label: 'ScrollToTopGuard',
    dir: 'react/components/scroll-to-top-guard',
    components: [
      {
        id: 'scroll-to-top-guard',
        label: 'ScrollToTopGuard',
        props: 'ScrollToTopGuardProps',
        merged: ['ScrollToTopGuard'],
      },
    ],
  },
  'components/safe-area': {
    entryPoint: `${LIB}/components/safe-area/index.ts`,
    label: 'SafeAreaView',
    dir: 'react/components/safe-area-view',
    components: [
      {
        id: 'safe-area-view',
        label: 'SafeAreaView',
        props: 'SafeAreaViewProps',
        merged: ['SafeAreaView'],
      },
    ],
  },
  'components/modals/form-sheet': {
    entryPoint: `${LIB}/components/modals/form-sheet/index.ts`,
    label: 'FormSheet',
    dir: 'react/components/form-sheet',
    components: [
      {
        id: 'form-sheet',
        label: 'FormSheet',
        props: 'FormSheetProps',
        merged: ['FormSheet'],
      },
    ],
  },
  'components/scroll-view-marker': {
    entryPoint: `${LIB}/components/scroll-view-marker/index.ts`,
    label: 'ScrollViewMarker',
    dir: 'react/components/scroll-view-marker',
    components: [
      {
        id: 'scroll-view-marker',
        label: 'ScrollViewMarker',
        props: 'ScrollViewMarkerProps',
        merged: ['ScrollViewMarker'],
      },
    ],
  },
  // The shared vocabulary (ColorScheme, the PlatformIcon* family, …): no components, so the
  // whole page is generated.
  types: {
    entryPoint: `${LIB}/types.ts`,
    label: 'Common Types',
    page: 'react/common-types',
    components: [],
  },
};

export const entryPoints = Object.values(FEATURES).map(feature => feature.entryPoint);

/** The component a reflection documents as part of: its props type, or one of its `merged`. */
export function componentFor(feature, reflection) {
  return feature.components.find(
    component =>
      reflection.name === component.props || component.merged.includes(reflection.name),
  );
}

/** The platform tokens the docs understand. Anything else in a `@platform` tag is a typo. */
const PLATFORMS = ['android', 'ios'];

/**
 * TypeDoc parks a function-type alias's comment on its signature (`type F = (x) => y`), not
 * on the alias, so `reflection.comment` alone misses those.
 */
export function commentOf(reflection) {
  return (
    reflection.comment ??
    reflection.signatures?.[0]?.comment ??
    reflection.type?.declaration?.signatures?.[0]?.comment
  );
}

/** A block tag's text (`blockTagText(r, '@since')` → `'5.0'`), `undefined` when absent. */
export function blockTagText(reflection, tagName) {
  const tag = commentOf(reflection)?.getTag(tagName);
  return tag
    ? tag.content
        .map(part => part.text)
        .join('')
        .trim()
    : undefined;
}

/** The platforms a symbol is documented for, read from `@platform`; `[]` when untagged. */
export function platformsOf(reflection) {
  const text = blockTagText(reflection, '@platform');
  if (text === undefined) return [];
  const tokens = text
    .split(',')
    .map(token => token.trim().toLowerCase())
    .filter(token => PLATFORMS.includes(token));
  return [...new Set(tokens)].sort();
}

/** `'ios'` / `'android'` for a single-platform symbol, `''` for everything else. */
export function platformDirOf(reflection) {
  const platforms = platformsOf(reflection);
  return platforms.length === 1 ? platforms[0] : '';
}

/** The generator-owned folder of a family (relative to docs/) — wiped on every run. */
export function outputRoot(feature) {
  return feature.dir ? `${feature.dir}/api-reference` : feature.page;
}

/** The file that assembles a family's generated parts (relative to docs/, no extension). */
export function outputFile(feature) {
  return feature.dir
    ? `${outputRoot(feature)}/_api-reference`
    : `${feature.page}/_common-types`;
}

/** `StackHeaderItemIOS` → `stackheaderitemios`, `android.icon` → `android-icon`. */
export function anchorSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The doc that links to a family's reflections resolve to (relative to docs/, no extension). */
export function linkTarget(feature) {
  return `${feature.dir ?? feature.page}/index`;
}
