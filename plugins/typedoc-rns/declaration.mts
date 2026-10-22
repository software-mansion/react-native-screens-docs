import {
  ReferenceType,
  ReflectionKind,
  ReflectionType,
  type DeclarationReflection,
  type Reflection,
} from 'typedoc';
import type { MarkdownThemeContext } from 'typedoc-plugin-markdown';

import { changeComment } from './comment.mts';
import type { RnsRouter } from './router.mts';
import { inlineType } from './types.mts';

type Partials = MarkdownThemeContext['partials'];
type Context = MarkdownThemeContext & { router: RnsRouter };

function urlOf(ctx: MarkdownThemeContext, reflection: Reflection | undefined) {
  return reflection && ctx.router.hasUrl(reflection)
    ? ctx.router.getFullUrl(reflection)
    : undefined;
}

/**
 * `**Type:**` with the type of a prop, a field or a type alias, and its links: types inside a
 * ```ts block cannot be links. Omitted when the line would have no link, and for object and
 * function literals, whose keys or parameters follow.
 */
function typeLine(
  ctx: MarkdownThemeContext,
  model: DeclarationReflection,
): string | undefined {
  if (
    !model.kindOf(ReflectionKind.Property | ReflectionKind.TypeAlias) ||
    !model.type ||
    model.type instanceof ReflectionType ||
    model.signatures
  ) {
    return undefined;
  }
  const md = inlineType(ctx, model.type);
  return md.includes('](') ? `**Type:** ${md}` : undefined;
}

/**
 * `**Extends:**` with the bases that have an entry of their own, whose members are documented
 * there, and the ones from other packages (`ViewProps`). A library base merged into this entry
 * (a component's `XPropsBase`) or with no entry (not exported) is left out: its members are
 * listed here.
 */
function extendsLine(
  ctx: MarkdownThemeContext,
  model: DeclarationReflection,
): string | undefined {
  const own = urlOf(ctx, model);
  const bases = (model.extendedTypes ?? []).filter(type => {
    if (!(type instanceof ReferenceType)) return true;
    if (!type.reflection) return type.package !== model.project.packageName;
    const url = urlOf(ctx, type.reflection);
    return url !== undefined && url !== own;
  });
  return bases.length
    ? `**Extends:** ${bases.map(type => inlineType(ctx, type)).join(', ')}`
    : undefined;
}

/**
 * Partials for an entry's own lines. `Type` and `Extends` open the comment's More information,
 * or follow the declaration when there is no comment. "Defined in", "Inherited from",
 * "Overrides" and the `Extends` / `Extended by` lists are not rendered, and the `optional`
 * keyword is left out: the `?` on the name says it.
 */
export function declarationPartials(
  ctx: Context,
  base: Partials,
): Pick<
  Partials,
  | 'declaration'
  | 'declarationTitle'
  | 'memberWithGroups'
  | 'members'
  | 'sources'
  | 'inheritance'
  | 'hierarchy'
> {
  return {
    // A component's section lists its props, so the props type's declaration would only repeat
    // them; the blank lines left in its place are collapsed by `transform`. A union broken onto
    // lines leaves a space after `=` or `:`.
    declarationTitle: model =>
      ctx.router.isComponentModel(model)
        ? ''
        : base.declarationTitle(model).replace(/ +\n/g, '\n'),
    declaration: (model, options) => {
      const line = typeLine(ctx, model);
      if (!line) return base.declaration(model, options);
      if (model.comment) {
        changeComment(model.comment, { lead: line });
        return base.declaration(model, options);
      }
      const title = ctx.partials.declarationTitle(model);
      const md = base.declaration(model, options);
      return md.startsWith(title)
        ? `${title}\n\n${line}${md.slice(title.length)}`
        : md;
    },
    memberWithGroups: (model, options) => {
      // A component is described on the component and on its family's Overview; its props
      // type says only whose props it holds, which the section's heading already does.
      if (ctx.router.isComponentModel(model) && model.comment) {
        changeComment(model.comment, { omitDescription: true });
      }
      const line = extendsLine(ctx, model);
      if (line && model.comment) changeComment(model.comment, { lead: line });
      const md = base.memberWithGroups(model, options);
      return line && !model.comment ? `${line}\n\n${md}` : md;
    },
    members: (model, options) =>
      base.members(
        model.filter(member => !ctx.router.isInheritedMember(member)),
        options,
      ),
    sources: () => '',
    inheritance: () => '',
    hierarchy: () => '',
  };
}

export function withoutOptionalFlag(
  getReflectionFlags: MarkdownThemeContext['helpers']['getReflectionFlags'],
): MarkdownThemeContext['helpers']['getReflectionFlags'] {
  return flags =>
    getReflectionFlags(flags)
      .split(' ')
      .filter(flag => flag !== '`optional`')
      .join(' ');
}
