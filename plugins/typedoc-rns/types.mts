import type { SomeType } from 'typedoc';
import type { MarkdownThemeContext } from 'typedoc-plugin-markdown';

type Partials = MarkdownThemeContext['partials'];

/** A theme context that tells a type rendered into a line of text from one in a ```ts block. */
export type InlineContext = MarkdownThemeContext & {
  /** Above 0 while `inlineType` renders. */
  rnsInlineDepth: number;
};

// The stock `unionType` puts each member on its own line past this many characters. Only the
// union counts, not the name declared before it, so a ```ts line can run longer.
const UNION_LINE_LENGTH = 70;

/**
 * A type on one line, for list items and labels. With `useCodeBlocks`, the stock `unionType`
 * breaks a long union onto lines that each open with `|`; outside a code block that reads as
 * a dangling pipe.
 */
export function inlineType(
  ctx: InlineContext,
  type: SomeType | undefined,
): string {
  ctx.rnsInlineDepth++;
  try {
    return ctx.partials.someType(type, { forceCollapse: true });
  } finally {
    ctx.rnsInlineDepth--;
  }
}

/** The text a reader sees: no link targets, code spans or escapes. */
function visibleLength(md: string): number {
  return md.replace(/\]\([^)]*\)/g, '').replace(/[`[\]\\]/g, '').length;
}

export function typePartials(
  ctx: InlineContext,
  base: Partials,
): Pick<Partials, 'unionType' | 'arrayType'> {
  return {
    // The stock partial measures the union with its links' targets, so a short union of
    // linked types breaks onto lines too; it is measured by what the reader sees instead.
    unionType: model => {
      const md = base.unionType(model);
      if (!md.startsWith('\n')) return md;
      const line = md
        .replace(/^\n\s*\\\| /, '')
        .replace(/\n\s*\\\| /g, ' \\| ');
      return ctx.rnsInlineDepth || visibleLength(line) <= UNION_LINE_LENGTH
        ? line
        : md;
    },
    // `string`[] → `string[]`, [`X`](#x)[] → [`X[]`](#x): the brackets are part of the type.
    // Only in text: a ```ts block drops the links, which it cannot do with `[]` inside them.
    arrayType: model => {
      const md = base.arrayType(model);
      return ctx.rnsInlineDepth
        ? md.replace(/^(\[?`[^`]+)`(\]\([^)]*\))?\[\]$/, '$1[]`$2')
        : md;
    },
  };
}
