/**
 * Page-level assembly that no partial owns: the part imports belong above the whole file,
 * and suppressed partials leave blank runs behind that span partial boundaries.
 *
 * @param {string} contents rendered page markdown
 * @param {{ imports?: string[] }} [options]
 */
export function transform(contents, options = {}) {
  const body = contents.replace(/\n{3,}/g, '\n\n').trim();
  const head = options.imports?.length ? `${options.imports.join('\n')}\n\n` : '';
  return `${head}${body}\n`;
}
