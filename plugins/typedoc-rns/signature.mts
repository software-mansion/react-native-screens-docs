import {
  i18n,
  ReflectionKind,
  ReflectionType,
  type DeclarationReflection,
  type ParameterReflection,
  type TypeParameterReflection,
} from 'typedoc';
import type { MarkdownThemeContext } from 'typedoc-plugin-markdown';

import { isInline, labeled, oneLine } from './comment.mts';
import { type InlineContext, inlineType } from './types.mts';

type Partials = MarkdownThemeContext['partials'];

const TYPE_PARAMETERS = ReflectionKind.pluralString(
  ReflectionKind.TypeParameter,
);
const PARAMETERS = ReflectionKind.pluralString(ReflectionKind.Parameter);
const RETURNS = i18n.theme_returns();

/** The stock `heading()` caps the level at 6. */
function headingPrefix(level: number): string {
  return `${'#'.repeat(Math.min(level, 6))} `;
}

/**
 * Replaces the stock partials' `Type Parameters` and `Parameters` headings with bold labels. Only
 * lines that are exactly such a heading at the partial's own level change; deeper signatures
 * render through the same partials and relabel their own.
 */
function relabel(md: string, level: number, labels: string[]): string {
  const prefix = headingPrefix(level);
  return md
    .split('\n')
    .map(line =>
      line.startsWith(prefix) && labels.includes(line.slice(prefix.length))
        ? `**${line.slice(prefix.length)}:**`
        : line,
    )
    .join('\n');
}

function indent(md: string): string {
  return md.replace(/^(?=.)/gm, '  ');
}

/**
 * A list item: the head, then the description after a dash when it is a single paragraph, or
 * below it, indented into the item, when it is not. `nested` is a list that goes into the item.
 */
function listItem(head: string, description = '', nested = ''): string {
  const text = description.trim();
  const item = !text
    ? `- ${head}`
    : isInline(text)
      ? `- ${head} — ${oneLine(text)}`
      : `- ${head}\n\n${indent(text)}`;
  return nested ? `${item}\n\n${indent(nested)}` : item;
}

/** The properties of an object-literal type, each with its own properties nested below it. */
function propertiesList(
  ctx: InlineContext,
  children: DeclarationReflection[],
): string {
  return children
    .map(child =>
      listItem(
        `\`${child.name}${child.flags.isOptional ? '?' : ''}\`: ${inlineType(ctx, child.type)}`,
        child.comment ? ctx.partials.comment(child.comment) : '',
        child.type instanceof ReflectionType && child.type.declaration.children
          ? propertiesList(ctx, child.type.declaration.children)
          : '',
      ),
    )
    .join('\n');
}

function parameterItem(
  ctx: InlineContext,
  parameter: ParameterReflection,
): string {
  const name = `${parameter.flags.isRest ? '...' : ''}${parameter.name}${parameter.flags.isOptional || parameter.defaultValue ? '?' : ''}`;
  const defaultValue = parameter.defaultValue
    ? ` = \`${ctx.helpers.getParameterDefaultValue(parameter)}\``
    : '';
  return listItem(
    `\`${name}\`: ${inlineType(ctx, parameter.type)}${defaultValue}`,
    parameter.comment ? ctx.partials.comment(parameter.comment) : '',
    parameter.type instanceof ReflectionType &&
      parameter.type.declaration.children
      ? propertiesList(ctx, parameter.type.declaration.children)
      : '',
  );
}

function typeParameterItem(
  ctx: InlineContext,
  typeParameter: TypeParameterReflection,
): string {
  const constraint = typeParameter.type
    ? ` *extends* ${inlineType(ctx, typeParameter.type)}`
    : '';
  const defaultType = typeParameter.default
    ? ` = ${inlineType(ctx, typeParameter.default)}`
    : '';
  return listItem(
    `\`${typeParameter.name}\`${constraint}${defaultType}`,
    typeParameter.comment ? ctx.partials.comment(typeParameter.comment) : '',
  );
}

/**
 * The signature-related partials with labels instead of section headings, and parameters and
 * type parameters as lists. Only the member above them has an anchor.
 */
export function signaturePartials(
  ctx: InlineContext,
  base: Partials,
): Pick<
  Partials,
  | 'signature'
  | 'declaration'
  | 'signatureReturns'
  | 'parametersList'
  | 'typeParametersList'
> {
  return {
    signature: (model, options) =>
      relabel(base.signature(model, options), options.headingLevel, [
        TYPE_PARAMETERS,
        PARAMETERS,
      ]),
    declaration: (model, options) =>
      relabel(base.declaration(model, options), options?.headingLevel ?? 2, [
        TYPE_PARAMETERS,
      ]),
    // `Returns` follows the label rule of the comment tags: inline for a single paragraph.
    signatureReturns: (model, options) => {
      const md = base.signatureReturns(model, options);
      const heading = `${headingPrefix(options.headingLevel)}${RETURNS}\n`;
      return md.startsWith(heading)
        ? labeled(RETURNS, md.slice(heading.length))
        : md;
    },
    parametersList: model =>
      model.map(parameter => parameterItem(ctx, parameter)).join('\n'),
    typeParametersList: model =>
      (model ?? [])
        .map(typeParameter => typeParameterItem(ctx, typeParameter))
        .join('\n'),
  };
}
