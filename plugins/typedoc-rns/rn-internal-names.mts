// React Native's internal type names, restored to their public spelling on the model.
//
// React Native 0.87 generates its type declarations from Flow and publishes several types as
// a plain alias of an internal one (`types_generated/Libraries/StyleSheet/StyleSheet.d.ts`):
//
//   export type ____ColorValue_Internal = null | string | number | NativeColorValue;
//   export type ColorValue = ____ColorValue_Internal;
//
// TypeScript keeps one type for both names, and its alias symbol is the internal one. TypeDoc
// keeps the name the source wrote only where it converts a type node — the members of a
// `type X = { … }` literal — while an interface member's type comes from the checker's
// `ts.Type`, so there the reference is recorded as `____ColorValue_Internal`. The names are
// rewritten once the converter has resolved the project, so every rendered form of a type —
// the declaration, a `Type:` line, a parameter, an `extends` clause — reads the same public
// name. Only `ReferenceType.name` changes; `qualifiedName` keeps the internal spelling, so an
// `externalSymbolLinkMappings` entry for `react-native` would have to use that.

import {
  DeclarationReflection,
  makeRecursiveVisitor,
  ParameterReflection,
  SignatureReflection,
  TypeParameterReflection,
  type ProjectReflection,
  type Reflection,
  type SomeType,
} from 'typedoc';

/**
 * An internal React Native name anywhere in a text, including the `_InternalBase` /
 * `_InternalCore` / `_InternalOverrides` building blocks of the style types, which have no
 * public spelling and are never renamed.
 */
export const RN_INTERNAL_NAME = /____[A-Za-z0-9]+_Internal[A-Za-z0-9]*/;

const INTERNAL_NAME = /^____([A-Za-z0-9]+)_Internal$/;

/**
 * The public spelling of each internal name the library's declarations reach: the React
 * Native export of the same meaning, or, where there is none, the type the way the library
 * writes it. Any other internal name is left as it is and fails `gen:api`, since the middle
 * part is not reliably a public export (`____TransformStyle_Internal` is `TransformsStyle`,
 * `____LayoutStyle_Internal` has no export at all).
 */
const PUBLIC_NAME: Record<string, string> = {
  ColorValue: 'ColorValue',
  FontWeight: "TextStyle['fontWeight']",
  ViewStyleProp: "ViewProps['style']",
};

function publicName(name: string): string | undefined {
  const middle = INTERNAL_NAME.exec(name)?.[1];
  return middle === undefined ? undefined : PUBLIC_NAME[middle];
}

/**
 * The types a reflection holds directly; nested types are reached through the visitor.
 * `extendedBy` / `implementedBy` only ever point at the project's own reflections.
 */
function typesOf(reflection: Reflection): (SomeType | undefined)[] {
  if (reflection instanceof DeclarationReflection) {
    return [
      reflection.type,
      ...(reflection.extendedTypes ?? []),
      ...(reflection.implementedTypes ?? []),
    ];
  }
  if (reflection instanceof TypeParameterReflection) {
    return [reflection.type, reflection.default];
  }
  if (
    reflection instanceof SignatureReflection ||
    reflection instanceof ParameterReflection
  ) {
    return [reflection.type];
  }
  return [];
}

/**
 * Renames every known `____X_Internal` reference in the project. Signatures, parameters and
 * type parameters are reflections of their own, and so is the declaration behind an object
 * type, so a flat pass over the project's reflections reaches every type.
 */
export function restoreRnInternalNames(project: ProjectReflection): void {
  const rename = makeRecursiveVisitor({
    reference(type) {
      const name = publicName(type.name);
      if (name !== undefined) type.name = name;
    },
  });
  for (const reflection of Object.values(project.reflections)) {
    for (const type of typesOf(reflection)) type?.visit(rename);
  }
}
