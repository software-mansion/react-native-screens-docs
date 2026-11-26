// Links on the type names in a part's ```ts blocks.
//
// A ```ts block cannot hold Markdown links, so the types it names are written after the part's
// content as reference definitions, `[type:ColorScheme]: ../../common-types/index.mdx#colorscheme`.
// They render nothing; Docusaurus resolves them like any link, to the page of the version being
// built, and fails the build on a broken one. A react-native type the reference does not
// document links to React Native's docs instead (react-native-types.mts); external, so the build
// does not check it.
// plugins/remark-type-links.js hands each block the ones it names, and
// src/theme/CodeBlock/Line/Token renders those names as links.

import {
  makeRecursiveVisitor,
  ReflectionKind,
  type Reflection,
  type ReferenceType,
  type SomeType,
} from 'typedoc';

import { reactNativeType } from './react-native-types.mts';
import type { InlineContext } from './types.mts';

/** The label prefix of the definitions; plugins/remark-type-links.js reads the same. */
const LABEL_PREFIX = 'type:';

/** The kinds of the entries a code block can link to. */
const TYPE_ENTRY =
  ReflectionKind.Interface |
  ReflectionKind.TypeAlias |
  ReflectionKind.Enum |
  ReflectionKind.Class;

/** The links of the part being rendered (theme.mts `renderFeaturePage`). */
export interface CodeLinks {
  /** The reflection the part documents: its own name in its declaration is not a link. */
  entry: Reflection;
  /** Type name → its URL: relative to the part (`urlTo`), or a page of React Native's docs. */
  links: Map<string, string>;
  /** The names linked to two different URLs in the part; a definition holds one. */
  conflicts: Set<string>;
}

export type CodeLinkContext = InlineContext & {
  /** Above 0 while a ```ts block renders (`inCode`). */
  rnsCodeDepth: number;
  rnsCodeLinks: CodeLinks | undefined;
};

/** Renders a ```ts block; the types it links are recorded for the part. */
export function inCode<T>(ctx: CodeLinkContext, render: () => T): T {
  ctx.rnsCodeDepth++;
  try {
    return render();
  } finally {
    ctx.rnsCodeDepth--;
  }
}

/**
 * Records a type a ```ts block names when it has an entry, or is a react-native type with a page
 * of React Native's docs (react-native-types.mts): not a type parameter, not another type
 * without a page, and not the entry the part documents. A type rendered into a line of text
 * (`inlineType`) is a Markdown link already.
 */
export function recordReference(
  ctx: CodeLinkContext,
  type: ReferenceType,
): void {
  const part = ctx.rnsCodeLinks;
  if (!part || ctx.rnsCodeDepth === 0 || ctx.rnsInlineDepth > 0) return;
  const target = type.reflection;
  let name: string;
  let url: string;
  if (target) {
    if (
      !target.kindOf(TYPE_ENTRY) ||
      !ctx.router.hasUrl(target) ||
      target === part.entry
    ) {
      return;
    }
    name = target.name;
    url = ctx.urlTo(target);
  } else {
    const page = reactNativeType(type);
    if (!page) return;
    ({ name, url } = page);
  }
  const known = part.links.get(name);
  if (known !== undefined && known !== url) part.conflicts.add(name);
  part.links.set(name, url);
}

/** Records the references in a type a ```ts block writes with `toString()`, unlinked. */
export function recordReferencesIn(
  ctx: CodeLinkContext,
  type: SomeType | undefined,
): void {
  inCode(ctx, () =>
    type?.visit(
      makeRecursiveVisitor({
        reference: reference => recordReference(ctx, reference),
      }),
    ),
  );
}

/** The part's definitions, one per name, sorted; empty when its blocks link nothing. */
export function definitions(part: CodeLinks): string {
  return [...part.links]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, url]) => `[${LABEL_PREFIX}${name}]: ${url}`)
    .join('\n');
}

/** The names of the documented types, which a ```ts block must link (`unlinkedNames`). */
export function typeEntryNames(ctx: CodeLinkContext): Set<string> {
  return new Set(
    ctx.page.project
      .getReflectionsByKind(TYPE_ENTRY)
      .filter(reflection => ctx.router.hasUrl(reflection))
      .map(reflection => reflection.name),
  );
}

/**
 * The documented type names a part's ```ts blocks show without a link: a type a declaration
 * block writes other than through `partials.referenceType` or `recordReferencesIn`, or one an
 * `@example` names. Strings and comments are skipped, and so are keys and parameter names
 * (`isKeyOrParameter`).
 */
export function unlinkedNames(
  body: string,
  part: CodeLinks,
  typeNames: Set<string>,
): string[] {
  const unlinked = new Set<string>();
  for (const [, code] of body.matchAll(/^```ts\n([\s\S]*?)\n```$/gm)) {
    // One pass, so a `//` inside a string is not taken for a comment.
    const text = code!.replace(
      /\/\*[\s\S]*?\*\/|\/\/.*$|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/gm,
      match => (match.startsWith('/') ? '' : '""'),
    );
    for (const match of text.matchAll(/[A-Za-z_$][\w$]*/g)) {
      const name = match[0];
      if (
        typeNames.has(name) &&
        !part.links.has(name) &&
        name !== part.entry.name &&
        !isKeyOrParameter(text, match.index!, name.length)
      ) {
        unlinked.add(name);
      }
    }
  }
  return [...unlinked];
}

// The same rule is in src/theme/CodeBlock/Line/Token, over Prism's tokens.
const BEFORE_KEY = /(?:^|[{(,;])\s*$/;
const AFTER_KEY = /^\s*\??:/;

/**
 * A key or a parameter name: it starts its line or follows `{`, `(`, `,` or `;`, and a `:` or
 * `?:` follows it. `A extends B ? C : D` keeps `C`, which follows `?`.
 */
function isKeyOrParameter(
  text: string,
  index: number,
  length: number,
): boolean {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  return (
    BEFORE_KEY.test(text.slice(lineStart, index)) &&
    AFTER_KEY.test(text.slice(index + length))
  );
}
