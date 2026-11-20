// The library's type aliases under the names the source writes.
//
// RFC-1960 has each family use a common type through its own alias
// (`export type FormSheetDetents = SheetDetents;`). TypeScript gives such an alias no type of its
// own: the checker's type of `FormSheetDetents` is `SheetDetents`'s, named after it, or after
// nothing when the target is an interface. The same holds for an alias of a single literal
// (`type TabsScreenRole = 'search'`) or of a keyword (`type X = number`). TypeDoc converts the
// type of a property, a parameter and a signature's return value from the checker's type, with
// the written type node only as a hint, so without this module the reference shows
// `detents?: SheetDetents`, links to Common Types and leaves the family's own entry unlinked.
// The checker's type is also why React Native's internal names show up (rn-internal-names.mts).
//
// `Converter.convertType` is wrapped. TypeDoc 0.28.20 calls it with a node hint for exactly
// these types: a property's, a parameter's, a signature's return type and an `accessor` field's.
// A variable's type is converted from its node already; an index signature's gets no hint and is
// not covered. Where the written type names such an alias, the type is rebuilt from the written
// node along the path to the alias, and every other part keeps the checker's type, so React
// Native's indexed types (`ViewStyle['backgroundColor']`) still show resolved (RFC-1960 rule 7).
// alias-gate.mts fails `gen:api` when a written alias is still missing from the model, for a
// type this module does not rebuild or after a TypeDoc upgrade that changes these calls.

import ts from 'typescript';
import {
  ArrayType,
  IntrinsicType,
  LiteralType,
  ReferenceType,
  UnionType,
  type Application,
  type Context,
  type SomeType,
} from 'typedoc';

type ConvertType = (
  context: Context,
  typeOrNode: ts.Type | ts.TypeNode | undefined,
  node?: ts.TypeNode,
) => SomeType;

/** The symbol a type reference names; an imported name resolves to its declaration. */
export function referencedSymbol(
  checker: ts.TypeChecker,
  node: ts.TypeReferenceNode,
): ts.Symbol | undefined {
  const symbol = checker.getSymbolAtLocation(node.typeName);
  return symbol && symbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

/** True for a type alias declared in the library, not in a dependency or TypeScript's lib. */
function isLibraryAlias(program: ts.Program, symbol: ts.Symbol): boolean {
  return (
    symbol.declarations?.some(declaration => {
      const file = declaration.getSourceFile();
      return (
        ts.isTypeAliasDeclaration(declaration) &&
        !program.isSourceFileFromExternalLibrary(file) &&
        !program.isSourceFileDefaultLibrary(file)
      );
    }) ?? false
  );
}

/** True for a reference to a library alias that the checker's type is not named after. */
export function losesName(
  program: ts.Program,
  node: ts.TypeReferenceNode,
): boolean {
  const checker = program.getTypeChecker();
  const symbol = referencedSymbol(checker, node);
  return (
    symbol !== undefined &&
    isLibraryAlias(program, symbol) &&
    checker.getTypeAtLocation(node).aliasSymbol !== symbol
  );
}

/**
 * True when a reference inside the type loses its name. Function and object literals are not
 * searched: their parameters, return types and members reach the wrapped `convertType` on
 * their own, so converting the literal again would leave its first conversion unused.
 */
function containsLostName(program: ts.Program, node: ts.Node): boolean {
  if (ts.isFunctionTypeNode(node) || ts.isTypeLiteralNode(node)) return false;
  if (ts.isTypeReferenceNode(node) && losesName(program, node)) return true;
  // `forEachChild` stops at the first truthy result, so only `true` is returned from it.
  return (
    ts.forEachChild(
      node,
      child => containsLostName(program, child) || undefined,
    ) ?? false
  );
}

/** True when the node or any node inside it passes the test. */
function someNode(node: ts.Node, test: (node: ts.Node) => boolean): boolean {
  return (
    test(node) ||
    (ts.forEachChild(node, child => someNode(child, test) || undefined) ??
      false)
  );
}

/**
 * True for a member inherited through an instantiation, `interface D extends B<number>`: its
 * written type names B's type parameter, while its type has the argument instead, so the
 * written node would show `T` on D. `undefined` is left out of the comparison: an optional
 * member's type includes it even when the source does not write it.
 */
function isInstantiated(
  checker: ts.TypeChecker,
  type: ts.Type,
  node: ts.TypeNode,
): boolean {
  const namesTypeParameter = someNode(
    node,
    child =>
      ts.isTypeReferenceNode(child) &&
      Boolean(
        (referencedSymbol(checker, child)?.flags ?? 0) &
        ts.SymbolFlags.TypeParameter,
      ),
  );
  if (!namesTypeParameter) return false;
  const written = checker.getNonNullableType(checker.getTypeFromTypeNode(node));
  const actual = checker.getNonNullableType(type);
  return !(
    checker.isTypeAssignableTo(written, actual) &&
    checker.isTypeAssignableTo(actual, written)
  );
}

/**
 * The members of a union as TypeDoc lists a checker's union: each literal and keyword once,
 * `true | false` merged into `boolean`, then `null` and `undefined` last. Other members keep
 * the written order.
 */
function orderUnion(members: readonly SomeType[]): SomeType[] {
  const seen = new Set<string>();
  const types = members.filter(type => {
    if (!(type instanceof LiteralType || type instanceof IntrinsicType)) {
      return true;
    }
    const key = type.toString();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const trueIndex = types.findIndex(
    type => type instanceof LiteralType && type.value === true,
  );
  const falseIndex = types.findIndex(
    type => type instanceof LiteralType && type.value === false,
  );
  if (trueIndex !== -1 && falseIndex !== -1) {
    types.splice(Math.max(trueIndex, falseIndex), 1);
    types.splice(
      Math.min(trueIndex, falseIndex),
      1,
      new IntrinsicType('boolean'),
    );
  }
  const weight = (type: SomeType) =>
    type instanceof LiteralType && type.value === null
      ? 1
      : type instanceof IntrinsicType && type.name === 'undefined'
        ? 2
        : 0;
  return types.sort((a, b) => weight(a) - weight(b));
}

/**
 * A type from its written node wherever the path leads to an alias that loses its name, and
 * from the checker everywhere else.
 */
function convertWritten(
  context: Context,
  node: ts.TypeNode,
  convert: ConvertType,
): SomeType {
  const { checker, program } = context;
  const fromChecker = () =>
    convert(context, checker.getTypeFromTypeNode(node), node);
  if (!containsLostName(program, node)) return fromChecker();

  if (ts.isParenthesizedTypeNode(node)) {
    return convertWritten(context, node.type, convert);
  }
  if (ts.isUnionTypeNode(node)) {
    const members = node.types.flatMap(member => {
      const type = convertWritten(context, member, convert);
      return type instanceof UnionType ? type.types : [type];
    });
    return new UnionType(orderUnion(members));
  }
  if (ts.isArrayTypeNode(node)) {
    return new ArrayType(convertWritten(context, node.elementType, convert));
  }
  if (ts.isTypeReferenceNode(node)) {
    if (losesName(program, node)) return convert(context, node);
    // A generic whose argument loses its name: `StyleProp<…>`, `NativeEventHandler<…>`. Only
    // that argument is converted again.
    const generic = fromChecker();
    const written = node.typeArguments ?? [];
    if (generic instanceof ArrayType && written.length === 1) {
      return new ArrayType(convertWritten(context, written[0]!, convert));
    }
    if (
      generic instanceof ReferenceType &&
      generic.typeArguments?.length === written.length
    ) {
      const checked = generic.typeArguments;
      generic.typeArguments = written.map((argument, index) =>
        containsLostName(program, argument)
          ? convertWritten(context, argument, convert)
          : checked[index]!,
      );
    }
    return generic;
  }
  // A tuple, an intersection or `readonly X[]` keeps the checker's type; alias-gate.mts reports
  // the name it loses there.
  return fromChecker();
}

/** Makes TypeDoc keep the library's aliases where TypeScript names their types differently. */
export function keepWrittenAliases(app: Application): void {
  // `convertType` is declared as two overloads, one for a node and one for a checker's type.
  const convert = app.converter.convertType.bind(app.converter) as ConvertType;
  const wrapped: ConvertType = (context, typeOrNode, node) =>
    node &&
    typeOrNode &&
    !('kind' in typeOrNode) &&
    containsLostName(context.program, node) &&
    !isInstantiated(context.checker, typeOrNode, node)
      ? convertWritten(context, node, convert)
      : convert(context, typeOrNode, node);
  app.converter.convertType = wrapped as typeof app.converter.convertType;
}
