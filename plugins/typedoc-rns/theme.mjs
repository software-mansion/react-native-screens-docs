import { posix } from 'node:path';
import { MarkdownTheme, MarkdownThemeContext } from 'typedoc-plugin-markdown';

import { outputRoot } from './feature-map.mjs';

const SEPARATOR = '\n\n***\n\n';

/** A part's path doubles as its MDX component name: `types/ios/_BlurEffect` → `TypeBlurEffect`. */
function partName(section) {
  return section.kind === 'component'
    ? section.title.replace(/[^A-Za-z0-9]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ''))
    : `Type${section.model.name}`;
}

/**
 * Renders a family into one file per section, and returns the file that assembles them: an
 * import per part, then the parts in page order. The parts are parked on the page for
 * index.mjs to write — a template can only return the one file TypeDoc asked for.
 */
function renderFeaturePage(ctx, layout) {
  const root = outputRoot(layout.feature);
  const parts = [];
  const imports = [];
  const usages = [];

  for (const section of layout.sections) {
    const name = partName(section);
    // Links are relative to the file they are written into, so a part resolves them from its
    // own folder while a link to this family's own page stays a bare anchor (`urlTo` below).
    ctx.rnsPartFile = `${root}/${section.part}${ctx.router.extension}`;
    const body = [
      `## ${section.title} {#${section.anchor}}`,
      ctx.partials.member(section.model, { headingLevel: 2 }),
    ].join('\n\n');
    ctx.rnsPartFile = undefined;

    parts.push({ path: section.part, body });
    imports.push(`import ${name} from './${section.part}${ctx.router.extension}';`);
    usages.push(`<${name} />`);
  }

  ctx.page.rnsParts = { root, parts, imports };
  return usages.join(SEPARATOR);
}

class RnsThemeContext extends MarkdownThemeContext {
  urlTo(reflection) {
    const [targetFile, fragment] = this.router.getFullUrl(reflection).split('#');
    const pageFile = this.router.linkFileFor?.(this.page.model) ?? this.page.url;
    if (targetFile === pageFile) {
      return fragment ? `#${fragment}` : '';
    }
    const from = this.rnsPartFile ?? pageFile;
    const relative = posix.relative(posix.dirname(from), targetFile);
    return encodeURI(`${relative}${fragment ? `#${fragment}` : ''}`);
  }

  constructor(theme, page, options) {
    super(theme, page, options);
    const baseTemplates = { ...this.templates };
    this.templates = {
      ...baseTemplates,
      reflection: event => {
        const layout = this.router.pageLayout?.(event.model);
        return layout ? renderFeaturePage(this, layout) : baseTemplates.reflection(event);
      },
    };
  }
}

export class RnsTheme extends MarkdownTheme {
  getRenderContext(page) {
    return new RnsThemeContext(this, page, this.application.options);
  }
}
