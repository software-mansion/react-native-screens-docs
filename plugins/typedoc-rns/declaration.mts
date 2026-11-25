import {
  ReferenceType,
  ReflectionKind,
  ReflectionType,
  type DeclarationReflection,
  type Reflection,
  type SomeType,
} from 'typedoc';
import type { MarkdownThemeContext } from 'typedoc-plugin-markdown';

import { type CodeLinkContext, recordReferencesIn } from './code-links.mts';
import {
  type CommentChanges,
  type CommentContext,
  withCommentChanges,
} from './comment.mts';
import type { RnsRouter } from './router.mts';
import { indent } from './signature.mts';
import { type InlineContext, inlineType } from './types.mts';

type Partials = MarkdownThemeContext['partials'];
type Context = CommentContext &
  InlineContext &
  CodeLinkContext & { router: RnsRouter };

function urlOf(ctx: MarkdownThemeContext, reflection: Reflection | undefined) {
  return reflection && ctx.router.hasUrl(reflection)
    ? ctx.router.getFullUrl(reflection)
    : undefined;
}

/**
 * `**Type:**` with the type of a prop, a field or a type alias, and its links. Omitted when the
 * line would have no link, and for object and function literals, whose keys or parameters
 * follow.
 */
function typeLine(
  ctx: InlineContext,
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
 * The bases an entry names: the ones that have an entry of their own, whose members are
 * documented there, and the ones from other packages (`ViewProps`). A library base merged into
 * this entry (a component's `XPropsBase`) or with no entry (not exported) is left out: its
 * members are listed here.
 */
function documentedBases(
  ctx: InlineContext,
  model: DeclarationReflection,
): SomeType[] {
  const own = urlOf(ctx, model);
  return (model.extendedTypes ?? []).filter(type => {
    if (!(type instanceof ReferenceType)) return true;
    if (!type.reflection) return type.package !== model.project.packageName;
    const url = urlOf(ctx, type.reflection);
    return url !== undefined && url !== own;
  });
}

/** `**Extends:**` with the bases the entry names (`documentedBases`), as links. */
function extendsLine(
  ctx: InlineContext,
  model: DeclarationReflection,
): string | undefined {
  const bases = documentedBases(ctx, model);
  return bases.length
    ? `**Extends:** ${bases.map(type => inlineType(ctx, type)).join(', ')}`
    : undefined;
}

/** The code inside a ```ts block that typedoc-plugin-markdown's `codeBlock` wrote. */
function unfenced(block: string): string {
  return block.replace(/^```ts\n|\n```$/g, '');
}

/** `code` in a ```ts block. */
function fenced(code: string): string {
  return `\`\`\`ts\n${code}\n\`\`\``;
}

/**
 * A declaration whose body spans lines, in a `<CollapsibleDeclaration>`: shown up to its `{`,
 * with `…` and its last line in place of the members, which the entry lists below it, and
 * expandable to the whole code (src/components/CollapsibleDeclaration).
 */
function collapsible(code: string): string {
  const head = code.slice(0, code.indexOf('{\n') + 1);
  const tail = code.slice(code.lastIndexOf('\n') + 1);
  return [
    '<CollapsibleDeclaration>',
    fenced(`${head} … ${tail}`),
    fenced(code),
    '</CollapsibleDeclaration>',
  ].join('\n\n');
}

/**
 * `<T extends X = Y>` for an interface's type parameters, written out because a type
 * parameter's own `toString()` names its kind.
 */
function typeParameterList(model: DeclarationReflection): string {
  const parameters = (model.typeParameters ?? []).map(parameter =>
    [
      parameter.name,
      parameter.type && ` extends ${parameter.type.toString()}`,
      parameter.default && ` = ${parameter.default.toString()}`,
    ]
      .filter(Boolean)
      .join(''),
  );
  return parameters.length ? `<${parameters.join(', ')}>` : '';
}

/**
 * One member of an interface as its declaration has it: a field as its heading shows it, a
 * method with its parameters, one line per overload, with the `?` of an optional method, which
 * the signature leaves out. A deprecated member, whose heading is struck through, gets a
 * `@deprecated` doc comment above it.
 */
function memberDeclaration(
  ctx: Context,
  member: DeclarationReflection,
): string {
  const optional = member.flags.isOptional ? '?' : '';
  const code = member.signatures
    ? member.signatures
        .map(signature =>
          unfenced(ctx.partials.signatureTitle(signature)).replace(
            member.name,
            `${member.name}${optional}`,
          ),
        )
        .join('\n')
    : unfenced(ctx.partials.declarationTitle(member));
  return member.isDeprecated() ? `/** @deprecated */\n${code}` : code;
}

/**
 * An interface's declaration, the way a type alias opens with its own, collapsed to its name
 * and bases (`collapsible`). It shows what the entry documents: the bases the `Extends` line
 * names and the members listed below (`documentedBases`, `isInheritedMember`), in the order the
 * source declares them; the members of a base with no entry of its own are listed as the
 * interface's. `extends` always starts a line of its own, with one base per line, so a single
 * base reads the same on every entry. An interface with call or index signatures gets no
 * block: the lists below the description show those.
 */
function interfaceDeclaration(
  ctx: Context,
  model: DeclarationReflection,
): string | undefined {
  if (model.signatures?.length || model.indexSignatures?.length) {
    return undefined;
  }
  const sourceLine = (member: DeclarationReflection) =>
    member.sources?.[0]?.line ?? 0;
  const members = (model.children ?? [])
    .filter(member => !ctx.router.isInheritedMember(member))
    .sort((a, b) => sourceLine(a) - sourceLine(b))
    .map(member => indent(memberDeclaration(ctx, member)));
  const name = `interface ${model.name}${typeParameterList(model)}`;
  const baseTypes = documentedBases(ctx, model);
  // The head is written with `toString()`; the types it names are recorded for their links.
  for (const type of baseTypes) recordReferencesIn(ctx, type);
  for (const parameter of model.typeParameters ?? []) {
    recordReferencesIn(ctx, parameter.type);
    recordReferencesIn(ctx, parameter.default);
  }
  const bases = baseTypes.map(type => type.toString());
  const head = bases.length
    ? `${name}\n  extends ${bases.join(',\n    ')} {`
    : `${name} {`;
  if (!members.length) return fenced(`${head}}`);
  return collapsible([head, ...members, '}'].join('\n'));
}

/**
 * A type alias of an object literal opens with its declaration as the stock partial writes
 * it; that block is made collapsible like an interface's.
 */
function collapseAliasDeclaration(
  ctx: Context,
  model: DeclarationReflection,
  md: string,
): string {
  const title = ctx.partials.declarationTitle(model);
  if (!model.children?.length || !title || !md.startsWith(title)) return md;
  return `${collapsible(unfenced(title))}${md.slice(title.length)}`;
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
        return withCommentChanges(ctx, model.comment, { lead: line }, () =>
          base.declaration(model, options),
        );
      }
      const title = ctx.partials.declarationTitle(model);
      const md = base.declaration(model, options);
      return md.startsWith(title)
        ? `${title}\n\n${line}${md.slice(title.length)}`
        : md;
    },
    memberWithGroups: (model, options) => {
      const line = extendsLine(ctx, model);
      const isComponent = ctx.router.isComponentModel(model);
      const change: CommentChanges = {};
      // A component is described on the component and on its family's Overview; its props
      // type says only whose props it holds, which the section's heading already does.
      if (isComponent) change.omitDescription = true;
      if (line) change.lead = line;
      const md = withCommentChanges(ctx, model.comment, change, () =>
        base.memberWithGroups(model, options),
      );
      const body = line && !model.comment ? `${line}\n\n${md}` : md;
      // A component's section lists its props instead of a declaration.
      if (isComponent) return body;
      if (model.kindOf(ReflectionKind.TypeAlias)) {
        return collapseAliasDeclaration(ctx, model, body);
      }
      // The stock partial opens only a type alias with its declaration.
      const declaration = model.kindOf(ReflectionKind.Interface)
        ? interfaceDeclaration(ctx, model)
        : undefined;
      return declaration ? `${declaration}\n\n${body}` : body;
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
