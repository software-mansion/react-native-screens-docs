import { Comment, type CommentDisplayPart, type CommentTag } from 'typedoc';
import type { MarkdownThemeContext } from 'typedoc-plugin-markdown';

type CommentPartial = MarkdownThemeContext['partials']['comment'];
type CommentOptions = NonNullable<Parameters<CommentPartial>[1]>;

const CALLOUT_KINDS: Record<string, string> = {
  '@note': 'note',
  '@tip': 'tip',
  '@info': 'info',
  '@warning': 'warning',
  '@danger': 'danger',
};

const LABELS: Record<string, string> = {
  '@defaultValue': 'Default',
  '@example': 'Example',
  '@see': 'See',
  // A heading with platform chips hides the tag; the line is left where nothing does.
  '@platform': 'Platform',
  '@deprecated': 'Deprecated',
};

/** One paragraph that does not open with a list, quote, code block or admonition. */
export function isInline(text: string): boolean {
  return !text.includes('\n\n') && !/^(```|:::|[-*>] |\d+\. )/.test(text);
}

/** A paragraph joined onto one line, without the indentation its continuation lines had. */
export function oneLine(text: string): string {
  return text.replace(/\s*\n\s*/g, ' ');
}

/**
 * `**Label:** body` for a single paragraph, joined onto one line; the label on a line of its own
 * when the body has several paragraphs or opens with a list, quote or code block.
 */
export function labeled(label: string, body: string): string {
  const text = body.trim();
  return isInline(text)
    ? `**${label}:** ${oneLine(text)}`
    : `**${label}:**\n\n${text}`;
}

/** A `:::kind` block, its fence one colon longer than any colon run inside it. */
function callout(kind: string, body: string): string {
  const longest = Math.max(
    0,
    ...(body.match(/:+/g) ?? []).map(run => run.length),
  );
  const fence = ':'.repeat(Math.max(3, longest + 1));
  return `${fence}${kind}\n\n${body}\n\n${fence}`;
}

const EXPERIMENTAL_CAUTION = callout(
  'warning',
  'This API is experimental. It may change in a breaking way — or be removed entirely — in any release.',
);

/**
 * TypeDoc wraps a `@defaultValue` that has no code in a ```` ```ts ```` block; a one-line
 * default is shown as it was written. A longer block, written by hand, stays a block.
 */
function unfenced(content: CommentDisplayPart[]): CommentDisplayPart[] {
  const [part] = content;
  if (content.length !== 1 || part?.kind !== 'code') return content;
  const match = /^```[^\n]*\n([^\n]*)\n```$/.exec(part.text);
  return match ? [{ kind: 'text', text: match[1] ?? '' }] : content;
}

/** The title of an `@example`, without a JSDoc `<caption>` around it. */
function exampleTitle(name: string): string {
  return /^<caption>(.*)<\/caption>$/.exec(name)?.[1] ?? name;
}

/** How an entry renders its comment, when it differs from the default. */
export interface CommentChanges {
  /**
   * A line that opens the comment's More information (`**Type:**`, `**Extends:**`): after the
   * summary and `@remarks`, before the other tags.
   */
  lead?: string;
  /** Leaves out the summary and `@remarks`; the other tags stay. */
  omitDescription?: boolean;
  /** Leaves out `@platform`, which the entry's heading shows. */
  omitPlatform?: boolean;
}

/** A theme context with the comment changes of the render calls in progress. */
export type CommentContext = MarkdownThemeContext & {
  rnsCommentChanges: Map<Comment, CommentChanges>;
};

/**
 * Calls `render` with `change` applied to this exact comment, and to nothing else: the comment
 * gets its previous changes back once `render` returns. A lead holds links relative to the part
 * being rendered, so it must not outlive the call. The changes of nested calls for the same
 * comment add up.
 */
export function withCommentChanges<T>(
  ctx: CommentContext,
  comment: Comment | undefined,
  change: CommentChanges,
  render: () => T,
): T {
  if (!comment) return render();
  const changes = ctx.rnsCommentChanges;
  const previous = changes.get(comment);
  changes.set(comment, { ...previous, ...change });
  try {
    return render();
  } finally {
    if (previous) changes.set(comment, previous);
    else changes.delete(comment);
  }
}

/** The tags this partial renders itself; any other goes through the stock partial. */
function isOwnTag(tag: CommentTag): boolean {
  return (
    tag.tag === '@remarks' || tag.tag in CALLOUT_KINDS || tag.tag in LABELS
  );
}

/**
 * The `comment` partial with the block tags as lines and callouts instead of headings:
 * `@remarks` continues the summary, `@defaultValue`, `@example`, `@see`, `@platform` and
 * `@deprecated` open with a bold label, `@note` … `@danger` become admonitions, and
 * `@experimental` adds a caution above the summary. Tags keep the order they are written in.
 * Text goes through the stock partial, so links and escaping are the same as elsewhere.
 *
 * The declaration and signature partials ask for the summary and for the tags in two calls, with
 * the type's members or the parameters in between. These tags render with the summary, so they
 * stay next to it; the second call renders only the other tags.
 */
export function renderComment(
  ctx: CommentContext,
  base: CommentPartial,
  model: Comment,
  options: CommentOptions = {},
): string {
  if (options.isTableColumn) return base(model, options);
  const showSummary = options.showSummary ?? true;
  const showTags = options.showTags ?? true;
  // The stock partial opens with the modifier line, empty here.
  const text = (parts: CommentDisplayPart[]): string =>
    base(new Comment(parts), { showSummary: true, showTags: false }).trim();
  const md: string[] = [];
  const change = ctx.rnsCommentChanges.get(model) ?? {};
  const description = !change.omitDescription;

  if (showSummary) {
    const modifiers = new Set(model.modifierTags);
    if (modifiers.delete('@experimental')) md.push(EXPERIMENTAL_CAUTION);
    md.push(
      base(new Comment(description ? model.summary : [], [], modifiers), {
        showSummary: true,
        showTags: false,
      }).trim(),
    );
  }

  let lead = showSummary ? change.lead : undefined;
  const hidden = new Set<string>(ctx.options.getValue('notRenderedTags'));
  if (!options.showReturns) hidden.add('@returns');
  if (change.omitPlatform) hidden.add('@platform');
  for (const tag of model.blockTags) {
    if (hidden.has(tag.tag)) continue;
    if (tag.tag === '@remarks' && !description) continue;
    if (isOwnTag(tag) ? showSummary : showTags) {
      if (lead && tag.tag !== '@remarks') {
        md.push(lead);
        lead = undefined;
      }
      md.push(renderTag(tag, text, base, options));
    }
  }
  if (lead) md.push(lead);

  return md.filter(Boolean).join('\n\n');
}

function renderTag(
  tag: CommentTag,
  text: (parts: CommentDisplayPart[]) => string,
  base: CommentPartial,
  options: CommentOptions,
): string {
  if (tag.tag === '@remarks') return text(tag.content);
  const kind = CALLOUT_KINDS[tag.tag];
  if (kind) return callout(kind, text(tag.content));
  const label = LABELS[tag.tag];
  if (label) {
    const body = text(
      tag.tag === '@defaultValue' ? unfenced(tag.content) : tag.content,
    );
    return tag.tag === '@example' && tag.name
      ? `**${label}:** ${text([{ kind: 'text', text: exampleTitle(tag.name) }])}\n\n${body}`
      : labeled(label, body);
  }
  return base(new Comment([], [tag]), {
    headingLevel: options.headingLevel,
    showSummary: false,
    showTags: true,
    showReturns: options.showReturns,
  });
}
