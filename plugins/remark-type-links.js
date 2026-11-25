// Links on the type names in the API reference's ```ts blocks.
//
// The generator ends each part with the types its blocks name, as reference definitions:
// `[type:ColorScheme]: ../../common-types/index.mdx#colorscheme` (plugins/typedoc-rns/
// code-links.mts). Docusaurus has resolved them to the page of the version being built by the
// time this plugin runs. Each ts block gets the ones it names, as a JSON `data-type-links`
// attribute on its <code>, which reaches src/theme/CodeBlock as a prop.

const LABEL_PREFIX = 'type:';

function visit(node, test, action) {
  if (test(node)) action(node);
  for (const child of node.children ?? []) visit(child, test, action);
}

/** Whether `code` names `name` as a whole identifier, not as part of a longer one. */
function names(code, name) {
  const escaped = name.replace(/\$/g, '\\$&');
  return new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`).test(code);
}

module.exports = function remarkTypeLinks() {
  return (root, file) => {
    const definitions = new Map();
    visit(
      root,
      node =>
        node.type === 'definition' && node.label?.startsWith(LABEL_PREFIX),
      node =>
        definitions.set(node.label.slice(LABEL_PREFIX.length), {
          url: node.url,
          node,
        }),
    );
    if (definitions.size === 0) return;

    const used = new Set();
    visit(
      root,
      node => node.type === 'code' && node.lang === 'ts',
      node => {
        const links = {};
        for (const [name, { url }] of definitions) {
          if (names(node.value, name)) {
            links[name] = url;
            used.add(name);
          }
        }
        if (Object.keys(links).length === 0) return;
        node.data ??= {};
        node.data.hProperties ??= {};
        node.data.hProperties['data-type-links'] = JSON.stringify(links);
      },
    );

    // A definition no block uses renders no link, so the build's broken-link check would not
    // see it either; it means the generator and this plugin disagree on what a block names.
    for (const [name, { node }] of definitions) {
      if (!used.has(name)) {
        file.fail(
          `No ts block names the type link [${LABEL_PREFIX}${name}].`,
          node,
        );
      }
    }
  };
};
