// A library alias whose name TypeScript drops shows under its own name in the reference.
// written-types.mts makes TypeDoc keep those names; this check fails `gen:api` for each one the
// model still misses: in a type that module does not rebuild (a tuple, an intersection,
// `readonly X[]`) or after a TypeDoc upgrade that changes how types are converted.
//
// It checks the types of properties, variables, parameters and signatures' return values. Index
// signatures, type parameter constraints and defaults, and `extends` clauses are not checked.

import ts from 'typescript';
import {
  DeclarationReflection,
  makeRecursiveVisitor,
  ParameterReflection,
  SignatureReflection,
  type Context,
  type Reflection,
  type SomeType,
} from 'typedoc';

import { sourceLocation } from './feature-map.mts';
import { losesName, referencedSymbol } from './written-types.mts';

/**
 * The aliases a type node names that lose their name in TypeScript. Skipped: function and
 * object literals, whose parameters, return types and members are reflections of their own,
 * and indexed access, `keyof` and `typeof`, where no name is shown.
 */
function lostAliases(
  program: ts.Program,
  node: ts.Node,
  names = new Set<string>(),
): Set<string> {
  if (
    ts.isFunctionTypeNode(node) ||
    ts.isTypeLiteralNode(node) ||
    ts.isIndexedAccessTypeNode(node) ||
    ts.isTypeQueryNode(node) ||
    (ts.isTypeOperatorNode(node) &&
      node.operator === ts.SyntaxKind.KeyOfKeyword)
  ) {
    return names;
  }
  if (ts.isTypeReferenceNode(node) && losesName(program, node)) {
    names.add(referencedSymbol(program.getTypeChecker(), node)!.name);
  }
  ts.forEachChild(node, child => {
    lostAliases(program, child, names);
  });
  return names;
}

/** The names of the references in a type, at any depth outside a function or object literal. */
function shownNames(type: SomeType | undefined): Set<string> {
  const names = new Set<string>();
  type?.visit(
    makeRecursiveVisitor({
      reference(reference) {
        names.add(reference.name);
      },
    }),
  );
  return names;
}

/**
 * True for a member a type inherits, or a parameter or signature of one: the type that declares
 * it is checked instead. TypeDoc sets `inheritedFrom` in its own listener on the same event,
 * registered before any plugin loads, so it runs first.
 */
function isInherited(reflection: Reflection): boolean {
  for (
    let current: Reflection | undefined = reflection;
    current;
    current = current.parent
  ) {
    if (current instanceof DeclarationReflection && current.inheritedFrom) {
      return true;
    }
  }
  return false;
}

function isValueDeclaration(
  declaration: ts.Declaration,
): declaration is
  | ts.PropertySignature
  | ts.PropertyDeclaration
  | ts.ParameterDeclaration
  | ts.VariableDeclaration {
  return (
    ts.isPropertySignature(declaration) ||
    ts.isPropertyDeclaration(declaration) ||
    ts.isParameter(declaration) ||
    ts.isVariableDeclaration(declaration)
  );
}

/** The type node a value, a parameter or a signature's return value is written with. */
function writtenTypeNode(
  context: Context,
  reflection: Reflection,
): ts.TypeNode | undefined {
  if (reflection instanceof SignatureReflection) {
    const owner = reflection.parent;
    // A method's or a function literal's signatures, or the one of a function type alias.
    const signatures = context
      .getSymbolFromReflection(owner)
      ?.declarations?.map(declaration =>
        ts.isTypeAliasDeclaration(declaration) ? declaration.type : declaration,
      )
      .filter(ts.isFunctionLike);
    const index = owner.signatures?.indexOf(reflection) ?? -1;
    return signatures?.[index]?.type;
  }
  // A method's or a function literal's own declaration holds its return type, which its
  // signature reports; only a value's type is checked here.
  return context
    .getSymbolFromReflection(reflection)
    ?.declarations?.find(isValueDeclaration)?.type;
}

/**
 * A `Name (file:line) — …` line for every property, parameter and return type whose written type
 * names an alias that the reference does not show.
 */
export function aliasProblems(context: Context): string[] {
  // `context.program` is only available while a source file is converted.
  const program = context.programs[0]!;
  const lines: string[] = [];
  for (const reflection of Object.values(context.project.reflections)) {
    if (
      !(reflection instanceof DeclarationReflection) &&
      !(reflection instanceof ParameterReflection) &&
      !(reflection instanceof SignatureReflection)
    ) {
      continue;
    }
    if (isInherited(reflection)) continue;
    const node = writtenTypeNode(context, reflection);
    if (!node) continue;
    const shown = shownNames(reflection.type);
    for (const name of lostAliases(program, node)) {
      if (!shown.has(name)) {
        lines.push(
          `  ${reflection.getFullName()} (${sourceLocation(reflection)}) — written \`${name}\`, ` +
            `shown \`${reflection.type?.toString()}\``,
        );
      }
    }
  }
  return lines;
}
