// `{@link}` targets in other families, and the gate on links nobody resolved.
//
// TypeDoc resolves a `{@link X}` through TypeScript when `X` is in the file's scope, and
// otherwise by walking up from the comment: its type, its module (the family's barrel), the
// project. The project's children are the modules, so a path that starts with a type of
// another family, or of Common Types, stops at its first name: TypeDoc logs a warning and
// the page shows plain text. This pass runs after TypeDoc's and reads every link still
// unresolved as `Type.member.…`: the first name is looked up among the exports of every
// module, the rest as members — an interface's or an object literal's, not those behind an
// intersection — and the reflection found becomes the link's target, so the router writes
// the usual link and anchor. A bare member name is not searched project-wide; a name
// exported by two modules is an error; a URL never gets here, since TypeDoc keeps it as a
// string target. Whatever is still unresolved stops the run. Only a comment's summary and
// block tags are read, which is where this theme renders links from.

import {
  type Comment,
  type InlineTagDisplayPart,
  type ProjectReflection,
  ReferenceReflection,
  Reflection,
  ReflectionKind,
  ReflectionSymbolId,
} from 'typedoc';

import { sourceLocation } from './feature-map.mts';

const LINK_TAGS = new Set(['@link', '@linkcode', '@linkplain']);

/** `Type`, `Type.member`, `Namespace.Key.member`, …: names joined by dots, nothing else. */
const TYPE_PATH = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;

function linkParts(comment: Comment): InlineTagDisplayPart[] {
  const parts = [
    ...comment.summary,
    ...comment.blockTags.flatMap(tag => tag.content),
  ];
  return parts.filter(
    (part): part is InlineTagDisplayPart =>
      part.kind === 'inline-tag' && LINK_TAGS.has(part.tag),
  );
}

/**
 * TypeDoc leaves an unresolved link's target empty, or as the symbol id TypeScript gave it
 * when the symbol has no reflection: a type of another package (`excludeExternals`), or one
 * of the library's own that no family exports or that `exclude` drops.
 */
function isUnresolved(part: InlineTagDisplayPart): boolean {
  return part.target === undefined || part.target instanceof ReflectionSymbolId;
}

/** The exports every module has (the project's own when there is a single entry point). */
function exportContainers(project: ProjectReflection): Reflection[] {
  const modules = (project.children ?? []).filter(child =>
    child.kindOf(ReflectionKind.Module),
  );
  return modules.length > 0 ? modules : [project];
}

type Lookup =
  | { found: Reflection }
  | { exportedBy: string[] }
  | { missing: true };

/** The reflection a `Type.member.…` path names, or why there is none. */
function findTarget(containers: Reflection[], path: string[]): Lookup {
  const [typeName, ...memberPath] = path as [string, ...string[]];
  // A re-export is a reference to the one reflection, so it counts as the same export.
  const roots = new Map<Reflection, string[]>();
  for (const container of containers) {
    let root = container.getChildByName(typeName);
    if (root instanceof ReferenceReflection)
      root = root.getTargetReflectionDeep();
    if (root) roots.set(root, [...(roots.get(root) ?? []), container.name]);
  }
  if (roots.size > 1) {
    return { exportedBy: [...roots.values()].flat() };
  }
  const root = [...roots.keys()][0];
  if (!root) return { missing: true };
  const target = memberPath.length > 0 ? root.getChildByName(memberPath) : root;
  return target ? { found: target } : { missing: true };
}

/** Why a link stays unresolved, or `undefined` once this pass has resolved it. */
function resolve(
  containers: Reflection[],
  packageName: string | undefined,
  part: InlineTagDisplayPart,
): string | undefined {
  if (part.target instanceof ReflectionSymbolId) {
    return part.target.packageName === packageName
      ? 'is not exported by any family (or is excluded), so it has no page'
      : `is a symbol of ${part.target.packageName}, which has no page here; link it through \`externalSymbolLinkMappings\``;
  }
  const [pathText = '', ...captionParts] = part.text.split('|');
  const pathString = pathText.trim();
  if (!TYPE_PATH.test(pathString)) {
    return 'is not a `Type.member` path (a caption goes after `|`)';
  }
  const lookup = findTarget(containers, pathString.split('.'));
  if ('exportedBy' in lookup) {
    return `is exported by ${lookup.exportedBy.join(', ')}`;
  }
  if ('missing' in lookup) return 'does not resolve';
  part.target = lookup.found;
  part.text = captionParts.join('|').trim() || pathString;
  return undefined;
}

/**
 * Resolves the links TypeDoc could not, and returns one line per link that is still
 * unresolved, with the comment's source. An inherited member repeats its base's comment, so
 * each source line is reported once.
 */
export function resolveCrossFamilyLinks(project: ProjectReflection): string[] {
  const containers = exportContainers(project);
  const lines = new Map<string, string>();
  for (const reflection of Object.values(project.reflections)) {
    if (!reflection.comment) continue;
    for (const part of linkParts(reflection.comment)) {
      if (!isUnresolved(part)) continue;
      const problem = resolve(containers, project.packageName, part);
      if (problem === undefined) continue;
      const where = sourceLocation(reflection);
      const key = `${where} ${part.text.trim()}`;
      if (!lines.has(key)) {
        lines.set(
          key,
          `  ${reflection.getFullName()} (${where}) — {@link ${part.text.trim()}} ${problem}`,
        );
      }
    }
  }
  return [...lines.values()];
}
