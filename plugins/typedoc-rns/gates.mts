import {
  DeclarationReflection,
  ReflectionKind,
  ReflectionType,
  type Comment,
  type CommentDisplayPart,
  type CommentTag,
  type ProjectReflection,
  type Reflection,
  type SignatureReflection,
} from 'typedoc';

import {
  FEATURES,
  PAGE_GROUPS,
  commentOf,
  membersOf,
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

// A re-export's comment is its target's, and an object literal's `__type` has none; the target
// and the keys are checked instead.
const NO_COMMENT_OF_ITS_OWN =
  ReflectionKind.Reference | ReflectionKind.TypeLiteral;

// The declarations `reflectionProblems` skips: modules and namespaces, which need no summary,
// and those with no comment of their own. Any other declaration, a new kind included, is
// checked. Parameters, type parameters and signatures are not declarations; they are checked
// with the function they belong to.
const NOT_CHECKED =
  ReflectionKind.Module | ReflectionKind.Namespace | NO_COMMENT_OF_ITS_OWN;

// The members of a type that say where they work: props, fields, inline object keys, commands,
// a ref's `ios` / `android` keys. Not enum members, which are values of a type, like the
// literals of a union. Not accessors: their comments sit on signatures `commentOf` does not
// read.
const MEMBER = ReflectionKind.Property | ReflectionKind.Method;

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

/**
 * The types whose members are props: each component's props type, the `XPropsBase` it
 * extends, and the props types of its `ios` / `android` props.
 */
function propsTypes(project: ProjectReflection): Set<Reflection> {
  const names = new Set(
    COMPONENTS.flatMap(component => [component.props, ...component.merged]),
  );
  const found = new Set<Reflection>();
  for (const reflection of Object.values(project.reflections)) {
    if (
      !(reflection instanceof DeclarationReflection) ||
      !names.has(reflection.name) ||
      isComponent(reflection)
    ) {
      continue;
    }
    found.add(reflection);
    for (const key of PAGE_GROUPS) {
      const prop = membersOf(reflection).find(member => member.name === key);
      if (prop?.type?.type === 'reference' && prop.type.reflection) {
        found.add(prop.type.reflection);
      }
    }
  }
  return found;
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

/** `ios >= 13.0`, `ios 13.0 - 18`: RFC-1947 drops a trailing `.0`. */
function hasTrailingZero(version: string | undefined): boolean {
  return /\.0$/.test(version ?? '');
}

function platformTags(comment: Comment | undefined): CommentTag[] {
  return (comment?.blockTags ?? []).filter(tag => tag.tag === '@platform');
}

/**
 * A `@platform` tag the grammar rejects. The theme draws a heading's chips from the tag and
 * throws on such a tag, so it is an error wherever it is.
 */
function malformedPlatform(tag: CommentTag): string[] {
  const { errors } = parsePlatformTag(text(tag.content));
  return errors.length > 0 ? [`malformed @platform: ${errors.join('; ')}`] : [];
}

/**
 * What is wrong with the way a readable `@platform` tag is written: the order of its platforms
 * and a trailing `.0`. A platform without a version is supported from the library's minimum.
 */
function platformStyle(tag: CommentTag): string[] {
  const { entries } = parsePlatformTag(text(tag.content));
  const problems: string[] = [];
  const names = entries.map(entry => entry.platform);
  if (names.join() !== [...names].sort().join()) {
    problems.push('@platform lists its platforms out of alphabetical order');
  }
  for (const entry of entries) {
    if (hasTrailingZero(entry.from) || hasTrailingZero(entry.to)) {
      problems.push(`@platform ${entry.platform}: drop the trailing \`.0\``);
    }
  }
  return problems;
}

/** A gate's findings: errors fail the run, warnings are only printed. */
export interface Findings {
  errors: string[];
  warnings: string[];
}

/**
 * What is wrong with the `@platform` of a component or a member, which should have exactly one.
 * A missing tag and the way a tag is written are warnings; more than one tag or a malformed one
 * are errors. A component and a prop report all of it as errors.
 */
function requiredPlatform(comment: Comment | undefined): Findings {
  const tags = platformTags(comment);
  if (tags.length === 0) return { errors: [], warnings: ['no @platform'] };
  if (tags.length > 1) {
    return { errors: ['more than one @platform tag'], warnings: [] };
  }
  const malformed = malformedPlatform(tags[0]!);
  return malformed.length > 0
    ? { errors: malformed, warnings: [] }
    : { errors: [], warnings: platformStyle(tags[0]!) };
}

/** `TypeAlias` → `type alias`. */
function kindName(kind: ReflectionKind): string {
  return ReflectionKind[kind]!.replace(/(?<!^)([A-Z])/g, ' $1').toLowerCase();
}

/**
 * The `@platform` of a declaration that is neither a component nor a prop. A member that is
 * not a prop (a field, an inline object key, a command, a ref's `ios` / `android` key) should
 * have one; anything else (a type, its signatures, a namespace, an enum member) should not
 * (R1, RFC-1947). These rules are newer than many of the library's comments, so they warn; a
 * tag the theme cannot read is still an error.
 */
function nonPropPlatformFindings(reflection: DeclarationReflection): Findings {
  if (reflection.kindOf(MEMBER)) return requiredPlatform(commentOf(reflection));
  const tags = [
    reflection.comment,
    ...signaturesOf(reflection).map(signature => signature.comment),
  ].flatMap(platformTags);
  if (tags.length === 0) return { errors: [], warnings: [] };
  const malformed = tags.flatMap(malformedPlatform);
  return malformed.length > 0
    ? { errors: malformed, warnings: [] }
    : {
        errors: [],
        warnings: [
          `this ${kindName(reflection.kind)} has @platform; only components, props and the fields of types have one`,
        ],
      };
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
  // Only `void` needs no `@returns`; any other return type does, `Promise<void>` and
  // `undefined` included.
  const returns = signature.type?.toString();
  if (
    returns &&
    returns !== 'void' &&
    !(signature.comment ?? comment)?.getTag('@returns')
  ) {
    problems.push(`returns ${returns} but has no @returns`);
  }
  return problems;
}

/**
 * True for `Props for {@link Tabs.Host}.`: the links name the components of the props type's
 * section, and the sentence ends.
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

/** True for a member of a props type (`props`), the `ios` / `android` keys included. */
function isProp(reflection: Reflection, props: Set<Reflection>): boolean {
  return reflection.parent !== undefined && props.has(reflection.parent);
}

/**
 * What is wrong with one reflection's comment, given what the reference shows of it. A
 * component and a prop say which platforms they work on; the `@platform` of everything else is
 * checked by `nonPropPlatformFindings`.
 */
function reflectionProblems(
  reflection: DeclarationReflection,
  props: Set<Reflection>,
): string[] {
  const comment = commentOf(reflection);
  const problems: string[] = [];
  if (!text(comment?.summary ?? [])) problems.push('no summary');
  if (isComponent(reflection) || isProp(reflection, props)) {
    const { errors, warnings } = requiredPlatform(comment);
    problems.push(...errors, ...warnings);
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
 * A `Name (file:line) — problem` line for every doc comment that breaks RFC-1947 or RFC-1960.
 * Errors: each declaration has a summary; a component and each prop have a well-formed
 * `@platform`; a function documents its type parameters, parameters and return value; a
 * component's props type says whose props it holds; a comment uses only RFC-1947's tags; no
 * `@platform` is unreadable. Warnings: members that are not props (fields, inline keys,
 * commands, ref keys) have a `@platform`, written in order and without a trailing `.0`, and
 * nothing else has one. A member a type inherits is checked once, on the type that declares it.
 */
export function commentProblems(project: ProjectReflection): Findings {
  const errors = new Map<string, string>();
  const warnings = new Map<string, string>();
  const report = (
    lines: Map<string, string>,
    reflection: Reflection,
    problems: string[],
  ) => {
    const where = sourceLocation(reflection);
    for (const problem of problems) {
      const key = `${where} ${problem}`;
      if (!lines.has(key)) {
        lines.set(key, `  ${reflection.getFullName()} (${where}) — ${problem}`);
      }
    }
  };

  const props = propsTypes(project);
  for (const reflection of Object.values(project.reflections)) {
    if (isInherited(reflection)) continue;
    for (const comment of [
      reflection.comment,
      ...(reflection instanceof DeclarationReflection
        ? signaturesOf(reflection).map(signature => signature.comment)
        : []),
    ]) {
      if (comment) report(errors, reflection, tagProblems(comment));
    }
    if (!(reflection instanceof DeclarationReflection)) continue;
    // Namespaces and modules too: a `@platform` there would never be shown.
    if (
      !reflection.kindOf(NO_COMMENT_OF_ITS_OWN) &&
      !isComponent(reflection) &&
      !isProp(reflection, props)
    ) {
      const findings = nonPropPlatformFindings(reflection);
      report(errors, reflection, findings.errors);
      report(warnings, reflection, findings.warnings);
    }
    if (!reflection.kindOf(NOT_CHECKED)) {
      report(errors, reflection, reflectionProblems(reflection, props));
    }
  }
  return { errors: [...errors.values()], warnings: [...warnings.values()] };
}
