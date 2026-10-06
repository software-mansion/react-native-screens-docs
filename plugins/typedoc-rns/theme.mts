import { posix } from 'node:path';
import {
  ReflectionKind,
  type DeclarationReflection,
  type Options,
  type Reflection,
  type RouterTarget,
} from 'typedoc';
import { MarkdownTheme, MarkdownThemeContext, type MarkdownPageEvent } from 'typedoc-plugin-markdown';

import { membersOf, outputRoot } from './feature-map.mjs';
import type { Layout, RnsRouter, Section } from './router.mjs';

/** The parts of a family page, parked on it by `renderFeaturePage` for index.mts to write. */
export interface RnsParts {
  root: string;
  parts: { path: string; body: string }[];
  imports: string[];
}

declare module 'typedoc-plugin-markdown' {
  interface MarkdownPageEvent<out Model extends RouterTarget = RouterTarget> {
    rnsParts?: RnsParts;
  }
}

const SEPARATOR = '\n\n***\n\n';

/** Docusaurus's MDX `a`, imported where a part needs an anchor without a heading. */
const ANCHOR_IMPORT = "import Anchor from '@theme/MDXComponents/A';";

// A section's heading level; the stock partial puts its props two below (`### Properties`,
// `#### prop`), and the flattened `ios.x` / `android.x` props sit at that level too.
const SECTION_LEVEL = 2;
const SECTION_PROP_LEVEL = SECTION_LEVEL + 2;

/**
 * A member heading carries the anchor the router gave it (`### title {#header-config-title}`).
 * Docusaurus would otherwise slug the heading text, and `title` of one section would take the
 * `#title` that the next section's `title` needs too — every cross-link to a member breaks.
 */
function renderMemberContainer(
  ctx: RnsThemeContext,
  model: DeclarationReflection,
  options: { headingLevel: number; nested?: boolean; titlePrefix?: string },
): string {
  // An `ios` / `android` prop renders nothing here: its props follow the section's (below).
  if (ctx.router.isFlattenedProp(model)) {
    return '';
  }
  const md = [];
  if (!ctx.router.hasOwnDocument(model) && model.kind !== ReflectionKind.Constructor) {
    const anchor = ctx.router.hasUrl(model) ? ctx.router.getAnchor(model) : undefined;
    const title = `${options.titlePrefix ?? ''}${ctx.partials.memberTitle(model)}`;
    md.push(
      `${'#'.repeat(options.headingLevel)} ${anchor ? `${title} {#${anchor}}` : title}`,
    );
  }
  md.push(
    ctx.partials.member(model, { headingLevel: options.headingLevel, nested: options.nested }),
  );
  return md.join('\n\n');
}

/** A part's path doubles as its MDX component name: `types/ios/_BlurEffect` → `TypeBlurEffect`. */
function partName(section: Section): string {
  return section.kind === 'component'
    ? section.title.replace(/[^A-Za-z0-9]+(.)?/g, (_, char?: string) =>
        char ? char.toUpperCase() : '',
      )
    : `Type${section.model.name}`;
}

/**
 * Renders a family into one file per section, and returns the file that assembles them: an
 * import per part, then the parts in page order. The parts are parked on the page for
 * index.mts to write — a template can only return the one file TypeDoc asked for.
 *
 * A component's `ios.x` / `android.x` props get a part each, right after the section's own
 * and with no separator between them, so they read as the rest of that section. Each part
 * opens with an empty anchor (`#host-ios`), the target of links to the platform props type and
 * to the `ios` prop. The anchor is Docusaurus's MDX `a` component, which registers the id with
 * the build's broken-anchor check and offsets the scroll target under the navbar; MDX renders a
 * literal `<a id>` without either.
 */
function renderFeaturePage(ctx: RnsThemeContext, layout: Layout): string {
  const root = outputRoot(layout.feature);
  const parts: RnsParts['parts'] = [];
  const imports: string[] = [];

  const part = (path: string, name: string, render: () => string): string => {
    // Links are relative to the file they are written into, so a part resolves them from its
    // own folder while a link to this family's own page stays a bare anchor (`urlTo` below).
    ctx.rnsPartFile = `${root}/${path}${ctx.router.extension}`;
    try {
      parts.push({ path, body: render() });
    } finally {
      ctx.rnsPartFile = undefined;
    }
    imports.push(`import ${name} from './${path}${ctx.router.extension}';`);
    return `<${name} />`;
  };

  const blocks = layout.sections.map(section => {
    const name = partName(section);
    const usages = [
      part(section.part!, name, () =>
        [
          `${'#'.repeat(SECTION_LEVEL)} ${section.title} {#${section.anchor}}`,
          ctx.partials.member(section.model, { headingLevel: SECTION_LEVEL }),
        ].join('\n\n'),
      ),
    ];
    for (const platform of section.platforms) {
      // `host/_ios` → `HostIos`
      const platformName = `${name}${platform.key[0]!.toUpperCase()}${platform.key.slice(1)}`;
      usages.push(
        part(platform.part, platformName, () =>
          [
            ANCHOR_IMPORT,
            `<Anchor id="${ctx.router.getAnchor(platform.model)}" />`,
            ...membersOf(platform.model).map(member =>
              renderMemberContainer(ctx, member, {
                headingLevel: SECTION_PROP_LEVEL,
                titlePrefix: `${platform.key}.`,
              }),
            ),
          ].join('\n\n'),
        ),
      );
    }
    return usages.join('\n\n');
  });

  ctx.page.rnsParts = { root, parts, imports };
  return blocks.join(SEPARATOR);
}

class RnsThemeContext extends MarkdownThemeContext {
  /** The part file `renderFeaturePage` is rendering now, `undefined` otherwise (see `urlTo`). */
  declare rnsPartFile: string | undefined;
  /** The router is always ours here — `typedoc.config.mjs` sets `router: 'rns'`. */
  declare router: RnsRouter;

  override urlTo(reflection: Reflection): string {
    const [targetFile, fragment] = this.router.getFullUrl(reflection).split('#') as [
      string,
      string | undefined,
    ];
    const pageFile = this.router.linkFileFor?.(this.page.model) ?? this.page.url;
    if (targetFile === pageFile) {
      return fragment ? `#${fragment}` : '';
    }
    const from = this.rnsPartFile ?? pageFile;
    const relative = posix.relative(posix.dirname(from), targetFile);
    return encodeURI(`${relative}${fragment ? `#${fragment}` : ''}`);
  }

  constructor(theme: MarkdownTheme, page: MarkdownPageEvent<Reflection>, options: Options) {
    super(theme, page, options);
    this.partials = {
      ...this.partials,
      memberContainer: (model, options) => renderMemberContainer(this, model, options),
    };
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
  override getRenderContext(page: MarkdownPageEvent<Reflection>): MarkdownThemeContext {
    return new RnsThemeContext(this, page, this.application.options);
  }
}
