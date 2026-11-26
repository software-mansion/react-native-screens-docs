import {
  ReferenceType,
  ReflectionKind,
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

/**
 * React Native props types a component's props extend, with the page of React Native's docs
 * that lists them. The reference leaves their props out (`excludeExternals`), so it points
 * there instead.
 */
const REACT_NATIVE_PROPS = new Map([
  [
    'ViewProps',
    { label: 'View props', url: 'https://reactnative.dev/docs/view#props' },
  ],
]);

/** The React Native props a base adds, if `REACT_NATIVE_PROPS` lists it. */
function reactNativeProps(type: SomeType) {
  return type instanceof ReferenceType && type.package === 'react-native'
    ? REACT_NATIVE_PROPS.get(type.name)
    : undefined;
}

/**
 * Lines for the bases (`documentedBases`) of an entry with no declaration block: a component's
 * props type, or an interface with call or index signatures. A component's React Native bases
 * listed in `REACT_NATIVE_PROPS` become one sentence that links to their props in React Native's
 * docs; any other base goes in an `**Extends:**` line.
 */
function basesLines(
  ctx: InlineContext,
  model: DeclarationReflection,
  isComponent: boolean,
): string | undefined {
  const accepted: { label: string; url: string }[] = [];
  const others: SomeType[] = [];
  for (const type of documentedBases(ctx, model)) {
    const props = isComponent ? reactNativeProps(type) : undefined;
    if (props) accepted.push(props);
    else others.push(type);
  }
  const lines: string[] = [];
  if (accepted.length) {
    const links = accepted.map(({ label, url }) => `[${label}](${url})`);
    lines.push(
      `Accepts React Native's ${new Intl.ListFormat('en').format(links)}.`,
    );
  }
  if (others.length) {
    lines.push(
      `**Extends:** ${others.map(type => inlineType(ctx, type)).join(', ')}`,
    );
  }
  return lines.length ? lines.join('\n\n') : undefined;
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
 * and bases (`collapsible`). It shows what the entry documents: the bases it names and the
 * members listed below (`documentedBases`, `isInheritedMember`), in the order the
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
 * Partials for an entry's own lines. An entry's declaration shows its type and its bases, with
 * links (code-links.mts). An entry without a declaration names its bases in lines instead
 * (`basesLines`), which open the comment's More information, or the entry when there is no
 * comment. "Defined in", "Inherited from", "Overrides" and the `Extends` /
 * `Extended by` lists are not rendered, and the `optional` keyword is left out: the `?` on the
 * name says it.
 */
export function declarationPartials(
  ctx: Context,
  base: Partials,
): Pick<
  Partials,
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
    memberWithGroups: (model, options) => {
      const isComponent = ctx.router.isComponentModel(model);
      // The stock partial opens only a type alias with its declaration.
      const declaration =
        !isComponent && model.kindOf(ReflectionKind.Interface)
          ? interfaceDeclaration(ctx, model)
          : undefined;
      const line = declaration
        ? undefined
        : basesLines(ctx, model, isComponent);
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
