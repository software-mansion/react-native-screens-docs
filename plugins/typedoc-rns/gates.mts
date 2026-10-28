import {
  DeclarationReflection,
  ReflectionKind,
  ReflectionType,
  type Comment,
  type CommentDisplayPart,
  type ProjectReflection,
  type Reflection,
  type SignatureReflection,
} from 'typedoc';

import {
  FEATURES,
  commentOf,
  parsePlatformTag,
  sourceLocation,
} from './feature-map.mts';

// The tags RFC-1947 defines: block, modifier and inline. Any other tag is reported.
const ALLOWED_TAGS = new Set<string>([
  '@remarks',
  '@note',
  '@tip',
  '@info',
  '@warning',
  '@danger',
  '@defaultValue',
  '@typeParam',
  '@param',
  '@returns',
  '@example',
  '@see',
  '@platform',
  '@deprecated',
  '@namespace',
  '@experimental',
  '@link',
]);

// The declarations with no comment of their own to check: modules and namespaces, re-exports,
// and an object literal's anonymous `__type`, whose keys are checked. Any other declaration,
// a new kind included, is checked. Parameters, type parameters and signatures are not
// declarations; they are checked with the function they belong to.
const NOT_CHECKED =
  ReflectionKind.Module |
  ReflectionKind.Namespace |
  ReflectionKind.Reference |
  ReflectionKind.TypeLiteral;

const COMPONENTS = Object.values(FEATURES).flatMap(
  feature => feature.components,
);

/**
 * A component as users write it (`Host: TabsHost` in a namespace, `SafeAreaView`): one of the
 * names the feature map merges into a section, declared as a value.
 */
function isComponent(reflection: Reflection): boolean {
  return (
    reflection.kindOf(ReflectionKind.Variable | ReflectionKind.Function) &&
    COMPONENTS.some(component => component.merged.includes(reflection.name))
  );
}

function ancestors(reflection: Reflection): Reflection[] {
  const found: Reflection[] = [];
  for (let current = reflection.parent; current; current = current.parent) {
    found.push(current);
  }
  return found;
}

/**
 * True for a member a type inherits, or a key under one: its comment is the base's, and the
 * base reports it.
 */
function isInherited(reflection: Reflection): boolean {
  return [reflection, ...ancestors(reflection)].some(
    current =>
      current instanceof DeclarationReflection &&
      Boolean(current.inheritedFrom),
  );
}

/** True for a key of an object a function parameter takes, which needs no `@platform`. */
function isUnderParameter(reflection: Reflection): boolean {
  return ancestors(reflection).some(current =>
    current.kindOf(ReflectionKind.Parameter),
  );
}

function text(parts: readonly { text: string }[]): string {
  return parts
    .map(part => part.text)
    .join('')
    .trim();
}

/** The signatures a declaration documents: a method's, or those of its function type. */
function signaturesOf(
  reflection: DeclarationReflection,
): SignatureReflection[] {
  return (
    reflection.signatures ??
    (reflection.type instanceof ReflectionType
      ? reflection.type.declaration.signatures
      : undefined) ??
    []
  );
}

// Return types that mean the function returns nothing, so need no `@returns`.
const NO_RETURN_VALUE = new Set(['void', 'undefined', 'never']);

/** `ios >= 13.0`, `ios 13.0 - 18`: RFC-1947 drops a trailing `.0`. */
function hasTrailingZero(version: string | undefined): boolean {
  return /\.0$/.test(version ?? '');
}

/** What is wrong with a `@platform` tag, or with its absence. */
function platformProblems(comment: Comment | undefined): string[] {
  const tags = (comment?.blockTags ?? []).filter(
    tag => tag.tag === '@platform',
  );
  if (tags.length === 0) return ['no @platform'];
  if (tags.length > 1) return ['more than one @platform tag'];
  const { entries, errors } = parsePlatformTag(text(tags[0]!.content));
  if (errors.length > 0) return [`malformed @platform: ${errors.join('; ')}`];
  const problems: string[] = [];
  const names = entries.map(entry => entry.platform);
  if (names.join() !== [...names].sort().join()) {
    problems.push('@platform lists its platforms out of alphabetical order');
  }
  for (const entry of entries) {
    if (entry.platform !== 'web' && !entry.from) {
      problems.push(`@platform gives ${entry.platform} no version`);
    }
    if (hasTrailingZero(entry.from) || hasTrailingZero(entry.to)) {
      problems.push(`@platform ${entry.platform}: drop the trailing \`.0\``);
    }
  }
  return problems;
}

/** What is wrong with a signature's `@typeParam`, `@param` and `@returns`. */
function signatureProblems(
  signature: SignatureReflection,
  comment: Comment | undefined,
): string[] {
  const problems: string[] = [];
  for (const typeParameter of signature.typeParameters ?? []) {
    if (!typeParameter.comment?.summary.length) {
      problems.push(`no @typeParam for ${typeParameter.name}`);
    }
  }
  for (const parameter of signature.parameters ?? []) {
    if (!parameter.comment?.summary.length) {
      problems.push(`no @param for ${parameter.name}`);
    }
  }
  const returns = signature.type?.toString();
  if (
    returns &&
    !NO_RETURN_VALUE.has(returns) &&
    !(signature.comment ?? comment)?.getTag('@returns')
  ) {
    problems.push(`returns ${returns} but has no @returns`);
  }
  return problems;
}

/**
 * True for `Props for {@link Tabs.Host}.`: the links name the components of the props type's
 * section (`Split.Column` and `Split.Inspector` share one), and the sentence ends.
 */
function isPropsSummary(
  summary: readonly CommentDisplayPart[],
  components: readonly string[],
): boolean {
  const links = summary.filter(
    part => part.kind === 'inline-tag' && part.tag === '@link',
  );
  const last = summary.at(-1);
  return (
    summary[0]?.text === 'Props for ' &&
    summary[1] === links[0] &&
    links.every(link =>
      components.includes(link.text.split('|')[0]!.trim().split('.').pop()!),
    ) &&
    last?.kind === 'text' &&
    last.text.trimEnd().endsWith('.')
  );
}

/** What is wrong with one reflection's comment, given what the reference shows of it. */
function reflectionProblems(reflection: DeclarationReflection): string[] {
  const comment = commentOf(reflection);
  const problems: string[] = [];
  if (!text(comment?.summary ?? [])) problems.push('no summary');
  if (!isUnderParameter(reflection)) {
    problems.push(...platformProblems(comment));
  }
  // A component's own signature is not documented; its props type is.
  if (isComponent(reflection)) return problems;

  const section = COMPONENTS.find(
    component => component.props === reflection.name,
  );
  if (section && !isPropsSummary(comment?.summary ?? [], section.merged)) {
    problems.push(
      "a props type's summary is `Props for {@link X}.`, linking its component",
    );
  }
  for (const typeParameter of reflection.typeParameters ?? []) {
    if (!typeParameter.comment?.summary.length) {
      problems.push(`no @typeParam for ${typeParameter.name}`);
    }
  }
  for (const signature of signaturesOf(reflection)) {
    problems.push(...signatureProblems(signature, comment));
  }
  return problems;
}

/** The tags of a comment: block, modifier and the inline ones in its text. */
function tagsOf(comment: Comment): string[] {
  const inline = (parts: readonly CommentDisplayPart[]) =>
    parts.flatMap(part => (part.kind === 'inline-tag' ? [part.tag] : []));
  return [
    ...comment.blockTags.flatMap(tag => [tag.tag, ...inline(tag.content)]),
    ...comment.modifierTags,
    ...inline(comment.summary),
  ];
}

/**
 * Tags RFC-1947 does not define, wherever a comment is. A second `@remarks` never reaches the
 * model: TypeDoc drops it with a warning, which `treatWarningsAsErrors` makes fatal.
 */
function tagProblems(comment: Comment): string[] {
  return [...new Set(tagsOf(comment))]
    .filter(tag => !ALLOWED_TAGS.has(tag))
    .map(tag => `${tag} is not allowed`);
}

/**
 * A `Name (file:line) — problem` line for every doc comment that breaks RFC-1947 or RFC-1960:
 * each declaration has a summary and a well-formed `@platform` (a key of a parameter's object
 * needs no `@platform`); a function documents its type parameters, parameters and return
 * value; a component's props type says whose props it holds; a comment uses only RFC-1947's
 * tags. A member a type inherits is checked once, on the type that declares it.
 */
export function commentProblems(project: ProjectReflection): string[] {
  const lines = new Map<string, string>();
  const report = (reflection: Reflection, problems: string[]) => {
    const where = sourceLocation(reflection);
    for (const problem of problems) {
      const key = `${where} ${problem}`;
      if (!lines.has(key)) {
        lines.set(key, `  ${reflection.getFullName()} (${where}) — ${problem}`);
      }
    }
  };

  for (const reflection of Object.values(project.reflections)) {
    if (isInherited(reflection)) continue;
    for (const comment of [
      reflection.comment,
      ...(reflection instanceof DeclarationReflection
        ? signaturesOf(reflection).map(signature => signature.comment)
        : []),
    ]) {
      if (comment) report(reflection, tagProblems(comment));
    }
    if (
      reflection instanceof DeclarationReflection &&
      !reflection.kindOf(NOT_CHECKED)
    ) {
      report(reflection, reflectionProblems(reflection));
    }
  }
  return [...lines.values()];
}
