// Which library module becomes which docs page, and which of its types are components.
// The single source of truth for the generator: the TypeDoc config reads the entry points
// from here, and the router and the theme read everything else.

import type {
  Comment,
  DeclarationReflection,
  Reflection,
  ReflectionType,
} from 'typedoc';

/** A component of a family: one section of its API reference. */
export interface Component {
  /** The section's anchor and the folder of its part: `host` → `#host`, `host/_host.mdx`. */
  id: string;
  /** The section heading: `Host`, `Column & Inspector`. */
  label: string;
  /** The component's public props type; its members are the section. */
  props: string;
  /**
   * Reflections documented as part of this section rather than on their own: the
   * `XPropsBase` interface the props type extends, and the namespace member users write
   * (`Tabs.Host`).
   */
  merged: string[];
}

/** A component family: one docs page. */
export interface Feature {
  /** The family's barrel in the library, passed to TypeDoc as an entry point. */
  entryPoint: string;
  /** The family's name, used in error messages. */
  label: string;
  /**
   * The docs folder; its API reference is generated into `<dir>/api-reference` and
   * imported by the hand-written page at `<dir>/index.mdx`.
   */
  dir: string;
  /** The sections of its API reference, in page order; empty for Common Types. */
  components: Component[];
}

/** The platforms a family page is split by: flattened `android` / `ios` props and Types groups. */
export type Platform = 'android' | 'ios';

export const LIB_REPO = '../react-native-screens';
const LIB = `${LIB_REPO}/src`;

/**
 * The families, keyed by TypeDoc module name — the entry point's path relative to the entry
 * points' common base, so `src/components/tabs/index.ts` is the module `components/tabs`.
 */
export const FEATURES: Record<string, Feature> = {
  'components/stack': {
    entryPoint: `${LIB}/components/stack/index.ts`,
    label: 'Stack',
    dir: 'react/containers/stack',
    components: [
      { id: 'host', label: 'Host', props: 'StackHostProps', merged: ['Host'] },
      {
        id: 'screen',
        label: 'Screen',
        props: 'StackScreenProps',
        merged: ['Screen'],
      },
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
  // The shared vocabulary (ColorScheme, the PlatformIcon* family, …): no components, so its
  // page is a list of types.
  types: {
    entryPoint: `${LIB}/types.ts`,
    label: 'Common Types',
    dir: 'react/common-types',
    components: [],
  },
};

export const entryPoints = Object.values(FEATURES).map(
  feature => feature.entryPoint,
);

/** The component a reflection documents as part of: its props type, or one of its `merged`. */
export function componentFor(
  feature: Feature,
  reflection: Reflection,
): Component | undefined {
  return feature.components.find(
    component =>
      reflection.name === component.props ||
      component.merged.includes(reflection.name),
  );
}

/**
 * The platforms, in the order the docs list them — alphabetical, the same everywhere: the
 * platform-specific types after the shared ones, and a component's flattened props after its
 * shared props (`<Tabs.Host ios={{ bottomAccessory }} />` documents as `ios.bottomAccessory`).
 */
export const PLATFORM_KEYS: readonly Platform[] = ['android', 'ios'];

/** The platforms a `@platform` tag may name. */
// A new platform also needs its chip: a label in src/components/PlatformHeading/index.tsx, a
// `.chip[data-platform=…]` rule in its styles.module.css and the badge tokens in
// src/css/colors.css, in both themes.
export const PLATFORM_NAMES = [
  'android',
  'ios',
  'tvos',
  'visionos',
  'web',
  'windows',
] as const;

export type PlatformName = (typeof PLATFORM_NAMES)[number];

/**
 * One entry of a `@platform` tag: `ios >= 13` → `{ platform: 'ios', from: '13' }`,
 * `ios 13 - 18` → `{ platform: 'ios', from: '13', to: '18' }`.
 */
export type PlatformEntry = { platform: PlatformName } & (
  | { from?: undefined; to?: undefined }
  | {
      /** The first version the symbol works on. */
      from: string;
      /** The last version the symbol works on; only with a first one. */
      to?: string;
    }
);

const VERSION = String.raw`\d+(?:\.\d+)*`;

// `web`, `ios >= 18`, `ios 13 - 18`, `windows >= 10.0.17763`: lower case, one space on each
// side of the operator, `>=` or `-`.
const PLATFORM_ENTRY = new RegExp(
  `^([a-z]+)(?: >= (${VERSION})| (${VERSION}) - (${VERSION}))?$`,
);

/** Compares dotted versions part by part: `15.1` comes after `15`, `10.0.17763` after `10`. */
function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * Splits a `@platform` tag into entries and lists what is malformed. Checks the shape of each
 * entry, not whether it has a version or the order of the entries.
 */
export function parsePlatformTag(text: string): {
  entries: PlatformEntry[];
  errors: string[];
} {
  const entries: PlatformEntry[] = [];
  const errors: string[] = [];
  if (text.trim() === '') {
    return { entries, errors: ['no platforms listed'] };
  }
  for (const raw of text.split(',')) {
    const entry = raw.trim();
    if (entry === '') {
      errors.push('empty entry (a trailing or doubled comma?)');
      continue;
    }
    const match = PLATFORM_ENTRY.exec(entry);
    if (!match) {
      errors.push(
        `"${entry}" is not \`<platform>\`, \`<platform> >= <version>\` or \`<platform> <version> - <version>\``,
      );
      continue;
    }
    const [, name, since, rangeFrom, rangeTo] = match;
    const from = since ?? rangeFrom;
    if (!PLATFORM_NAMES.includes(name as PlatformName)) {
      errors.push(`"${name}" is not a platform (${PLATFORM_NAMES.join(', ')})`);
    } else if (entries.some(known => known.platform === name)) {
      errors.push(`"${name}" is listed twice`);
    } else if (
      rangeFrom &&
      rangeTo &&
      compareVersions(rangeFrom, rangeTo) >= 0
    ) {
      errors.push(`"${entry}": the first version is not below the last`);
    } else {
      const platform = name as PlatformName;
      entries.push(
        from
          ? { platform, from, ...(rangeTo && { to: rangeTo }) }
          : { platform },
      );
    }
  }
  return { entries, errors };
}

/**
 * TypeDoc parks a function-type alias's comment on its signature (`type F = (x) => y`), not
 * on the alias, so `reflection.comment` alone misses those.
 */
export function commentOf(reflection: Reflection): Comment | undefined {
  return (
    reflection.comment ??
    (reflection as DeclarationReflection).signatures?.[0]?.comment ??
    ((reflection as DeclarationReflection).type as ReflectionType | undefined)
      ?.declaration?.signatures?.[0]?.comment
  );
}

/** A props type's own props — an interface's children, or those of an object type. */
export function membersOf(
  model: DeclarationReflection,
): DeclarationReflection[] {
  if (model.children?.length) return model.children;
  return model.type?.type === 'reflection'
    ? (model.type.declaration.children ?? [])
    : [];
}

/** A block tag's text (`blockTagText(r, '@since')` → `'5.0'`), `undefined` when absent. */
export function blockTagText(
  reflection: Reflection,
  tagName: `@${string}`,
): string | undefined {
  const tag = commentOf(reflection)?.getTag(tagName);
  return tag
    ? tag.content
        .map(part => part.text)
        .join('')
        .trim()
    : undefined;
}

/**
 * A symbol's `@platform` entries in the tag's order; `[]` when untagged. Throws on a malformed
 * tag.
 */
export function platformEntriesOf(reflection: Reflection): PlatformEntry[] {
  const text = blockTagText(reflection, '@platform');
  if (text === undefined) return [];
  const { entries, errors } = parsePlatformTag(text);
  if (errors.length > 0) {
    throw new Error(`Malformed @platform: ${errors.join('; ')}`);
  }
  return entries;
}

/** The Types group of each platform; `web` and `windows` belong to none. */
const PLATFORM_GROUPS: Partial<Record<PlatformName, Platform>> = {
  android: 'android',
  ios: 'ios',
  tvos: 'ios',
  visionos: 'ios',
};

/** The one Types group all of a symbol's platforms fall into, `''` when there is none. */
export function platformDirOf(reflection: Reflection): Platform | '' {
  const groups = new Set(
    platformEntriesOf(reflection).flatMap(
      entry => PLATFORM_GROUPS[entry.platform] ?? [],
    ),
  );
  return groups.size === 1 ? ([...groups][0] ?? '') : '';
}

/** The generator-owned folder of a family (relative to docs/) — wiped on every run. */
export function outputRoot(feature: Feature): string {
  return `${feature.dir}/api-reference`;
}

/** The file that assembles a family's generated parts (relative to docs/, no extension). */
export function outputFile(feature: Feature): string {
  return `${outputRoot(feature)}/_api-reference`;
}

/** `StackHeaderItemIOS` → `stackheaderitemios`, `android.icon` → `android-icon`. */
export function anchorSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The doc that links to a family's reflections resolve to (relative to docs/, no extension). */
export function linkTarget(feature: Feature): string {
  return `${feature.dir}/index`;
}
