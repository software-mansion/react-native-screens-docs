/**
 * Last pass over every file the generator writes — a family page and each of its parts:
 *
 * - Blank lines. A partial that renders nothing still leaves its separators behind, so runs
 *   of 3+ newlines collapse to one blank line (safe in fences: TypeDoc emits none there).
 * - Part imports. The page shows its parts as `<Host />`, …; their `import` lines are known
 *   only once every part is rendered (`renderFeaturePage`), so they go on top here.
 *
 * @param contents a rendered page or part
 * @param options.imports `import` lines to put above the page body
 */
export function transform(
  contents: string,
  options: { imports?: string[] } = {},
): string {
  const body = contents.replace(/\n{3,}/g, '\n\n').trim();
  const head = options.imports?.length
    ? `${options.imports.join('\n')}\n\n`
    : '';
  return `${head}${body}\n`;
}
