import { posix } from 'node:path';
import {
  ReflectionKind,
  type DeclarationReflection,
  type Options,
  type Reflection,
  type RouterTarget,
} from 'typedoc';
import {
  MarkdownTheme,
  MarkdownThemeContext,
  type MarkdownPageEvent,
} from 'typedoc-plugin-markdown';

import { changeComment, renderComment } from './comment.mts';
import { declarationPartials, withoutOptionalFlag } from './declaration.mts';
import {
  commentOf,
  membersOf,
  outputRoot,
  platformEntriesOf,
} from './feature-map.mts';
import type { Layout, RnsRouter, Section } from './router.mts';
import { signaturePartials } from './signature.mts';
import { typePartials } from './types.mts';

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

/** Docusaurus's MDX `a`, imported where a part needs an anchor without a heading. */
const ANCHOR_IMPORT = "import Anchor from '@theme/MDXComponents/A';";

// The level of a family page's component sections and its `### Types` heading, under the
// hand-written `## API Reference`; the types sit one below. The Common Types page has no API
// Reference part, so its types take this level, the lowest the table of contents lists: one
// higher, their members would be listed too. A member is one level below its entry.
const TOP_LEVEL = 3;
const TYPES_HEADING = `${'#'.repeat(TOP_LEVEL)} Types {#types}`;

/**
 * A heading in a `<ReferenceHeading>`, with a chip per platform of the reflection's `@platform`
 * tag and a link to its declaration where it has them. Every declaration heading gets the row,
 * so the page's CSS can rely on it. It also makes the reflection's comment leave the tag out,
 * so it runs before the comment renders.
 */
function referenceHeading(
  reflection: DeclarationReflection,
  heading: string,
  { section = false } = {},
): string {
  const comment = commentOf(reflection);
  const platforms = platformEntriesOf(reflection);
  const source = reflection.sources?.[0]?.url;
  if (comment && platforms.length > 0) {
    changeComment(comment, { omitPlatform: true });
  }
  const props = [
    // A component's section, which the page's CSS sets apart from a type.
    section && 'section',
    platforms.length > 0 && `platforms={${JSON.stringify(platforms)}}`,
    source && `source={${JSON.stringify(source)}}`,
  ].filter(Boolean);
  return `<ReferenceHeading${props.map(prop => ` ${prop}`).join('')}>\n${heading}\n</ReferenceHeading>`;
}

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
  if (
    !ctx.router.hasOwnDocument(model) &&
    model.kind !== ReflectionKind.Constructor
  ) {
    const anchor = ctx.router.hasUrl(model)
      ? ctx.router.getAnchor(model)
      : undefined;
    const title = `${options.titlePrefix ?? ''}${ctx.partials.memberTitle(model)}`;
    // Markdown has no heading below h6; a deeper member stays at h6.
    const heading = `${'#'.repeat(Math.min(options.headingLevel, 6))} ${anchor ? `${title} {#${anchor}}` : title}`;
    md.push(referenceHeading(model, heading));
  }
  md.push(
    ctx.partials.member(model, {
      headingLevel: options.headingLevel,
      nested: options.nested,
    }),
  );
  return md.join('\n\n');
}

/**
 * An entry's content under its heading, in a `reference-entry` block: the page's CSS hangs it
 * off a line, so what belongs to which entry shows without rules between its members. A
 * section's `ios.*` / `android.*` props are `continued`: their block carries on the section's.
 */
function entryBody(md: string, { continued = false } = {}): string {
  const className = continued
    ? 'reference-entry reference-entry--continued'
    : 'reference-entry';
  return `<div className="${className}">\n\n${md}\n\n</div>`;
}

/** A section's name, struck through when it is deprecated, as a member's name is. */
function sectionTitle(section: Section): string {
  return section.model.isDeprecated() ? `~~${section.title}~~` : section.title;
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

  const components = layout.sections.filter(
    section => section.kind === 'component',
  );
  const types = layout.sections.filter(section => section.kind === 'type');
  const typeLevel = components.length > 0 ? TOP_LEVEL + 1 : TOP_LEVEL;

  const render = (section: Section): string => {
    const name = partName(section);
    const level = section.kind === 'component' ? TOP_LEVEL : typeLevel;
    const usages = [
      part(section.part!, name, () =>
        [
          referenceHeading(
            section.model,
            `${'#'.repeat(level)} ${sectionTitle(section)} {#${section.anchor}}`,
            { section: section.kind === 'component' },
          ),
          entryBody(
            ctx.partials.member(section.model, { headingLevel: level }),
          ),
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
            entryBody(
              membersOf(platform.model)
                .map(member =>
                  renderMemberContainer(ctx, member, {
                    headingLevel: level + 1,
                    titlePrefix: `${platform.key}.`,
                  }),
                )
                .join('\n\n'),
              { continued: true },
            ),
          ].join('\n\n'),
        ),
      );
    }
    return usages.join('\n\n');
  };

  // No rules between the blocks: where an entry's line ends and the next heading starts shows
  // where one ends and the next begins.
  const blocks = [
    ...components.map(render),
    ...(components.length > 0 && types.length > 0 ? [TYPES_HEADING] : []),
    ...types.map(render),
  ];

  ctx.page.rnsParts = { root, parts, imports };
  return blocks.join('\n\n');
}

class RnsThemeContext extends MarkdownThemeContext {
  /** The part file `renderFeaturePage` is rendering now, `undefined` otherwise (see `urlTo`). */
  declare rnsPartFile: string | undefined;
  /** The router is always ours here — `typedoc.config.mjs` sets `router: 'rns'`. */
  declare router: RnsRouter;

  override urlTo(reflection: Reflection): string {
    const [targetFile, fragment] = this.router
      .getFullUrl(reflection)
      .split('#') as [string, string | undefined];
    const pageFile =
      this.router.linkFileFor?.(this.page.model) ?? this.page.url;
    if (targetFile === pageFile) {
      return fragment ? `#${fragment}` : '';
    }
    const from = this.rnsPartFile ?? pageFile;
    const relative = posix.relative(posix.dirname(from), targetFile);
    return encodeURI(`${relative}${fragment ? `#${fragment}` : ''}`);
  }

  constructor(
    theme: MarkdownTheme,
    page: MarkdownPageEvent<Reflection>,
    options: Options,
  ) {
    super(theme, page, options);
    const basePartials = this.partials;
    const signatures = signaturePartials(this, basePartials);
    this.partials = {
      ...this.partials,
      ...signatures,
      ...typePartials(basePartials),
      ...declarationPartials(this, { ...basePartials, ...signatures }),
      comment: (model, options) =>
        renderComment(this, basePartials.comment, model, options),
      memberContainer: (model, options) =>
        renderMemberContainer(this, model, options),
      // Optional shows in the declaration below the heading (`colorScheme?: …`).
      memberTitle: model =>
        basePartials.memberTitle(model).replace(/\?(~~)?$/, '$1'),
      // A section lists its members under its own heading, one level below it, without a
      // `Properties` / `Methods` heading per group. Groups split into categories are left to the
      // stock partial. A group's `@groupDescription` and the stock index of members with pages
      // of their own are not rendered; the reference has neither.
      groups: (model, options) => {
        const groups = model.groups ?? [];
        if (groups.some(group => group.categories)) {
          return basePartials.groups(model, options);
        }
        return groups
          .map(group =>
            this.partials.members(
              group.children.filter(child => child.isDeclaration()),
              {
                headingLevel: options.headingLevel,
                groupTitle: group.title,
              },
            ),
          )
          .join('\n\n');
      },
    };
    this.helpers = {
      ...this.helpers,
      getReflectionFlags: withoutOptionalFlag(this.helpers.getReflectionFlags),
    };
    const baseTemplates = { ...this.templates };
    this.templates = {
      ...baseTemplates,
      reflection: event => {
        const layout = this.router.pageLayout?.(event.model);
        return layout
          ? renderFeaturePage(this, layout)
          : baseTemplates.reflection(event);
      },
    };
  }
}

export class RnsTheme extends MarkdownTheme {
  override getRenderContext(
    page: MarkdownPageEvent<Reflection>,
  ): MarkdownThemeContext {
    return new RnsThemeContext(this, page, this.application.options);
  }
}
