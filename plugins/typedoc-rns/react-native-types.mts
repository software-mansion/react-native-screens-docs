// Types from react-native that the reference names but does not document (`excludeExternals`
// in typedoc.config.mjs). They link to React Native's own docs instead: in a ```ts block
// (code-links.mts), and where a component's props extend one (declaration.mts). The other
// react-native types the reference names, such as `NativeSyntheticEvent` and `HostInstance`,
// have no page there and stay unlinked.

import { ReferenceType, type SomeType } from 'typedoc';

/**
 * How the sentence under a component's heading starts when its props extend react-native types:
 * "Accepts React Native's [View props](…)." (declaration.mts).
 */
export const ACCEPTS_REACT_NATIVE = "Accepts React Native's";

/**
 * A react-native type's page of React Native's docs, and what the `ACCEPTS_REACT_NATIVE`
 * sentence calls it.
 */
export interface ReactNativeDocsPage {
  label: string;
  url: string;
}

const REACT_NATIVE_TYPES = new Map<string, ReactNativeDocsPage>([
  [
    'ViewProps',
    { label: 'View props', url: 'https://reactnative.dev/docs/view#props' },
  ],
  [
    'ColorValue',
    { label: 'colors', url: 'https://reactnative.dev/docs/colors' },
  ],
  ['StyleProp', { label: 'style', url: 'https://reactnative.dev/docs/style' }],
  [
    'ViewStyle',
    {
      label: 'View style props',
      url: 'https://reactnative.dev/docs/view-style-props',
    },
  ],
  [
    'ImageSource',
    {
      label: 'image source',
      url: 'https://reactnative.dev/docs/image#imagesource',
    },
  ],
  [
    'TextStyle',
    {
      label: 'Text style props',
      url: 'https://reactnative.dev/docs/text-style-props',
    },
  ],
]);

/**
 * React Native's page for `type`, if it is a react-native type the map lists, with the name to
 * link: the type's own, or for a restored internal name written as an expression
 * (`TextStyle['fontWeight']`, rn-internal-names.mts) the type it starts with.
 */
export function reactNativeType(
  type: SomeType,
): (ReactNativeDocsPage & { name: string }) | undefined {
  if (!(type instanceof ReferenceType) || type.package !== 'react-native') {
    return undefined;
  }
  const name = /^[A-Za-z_$][\w$]*/.exec(type.name)?.[0];
  const page = name && REACT_NATIVE_TYPES.get(name);
  return page ? { ...page, name } : undefined;
}
