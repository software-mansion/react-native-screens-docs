import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Converter, type Application, type ProjectReflection } from 'typedoc';
import { MarkdownPageEvent } from 'typedoc-plugin-markdown';

import type { RnsParts } from './theme.mts';

import { parsePlatformTag, sourceLocation } from './feature-map.mts';
import { resolveCrossFamilyLinks } from './links.mts';
import { restoreRnInternalNames } from './rn-internal-names.mts';
import { RnsRouter } from './router.mts';
import { RnsTheme } from './theme.mts';
import { transform } from './transform.mts';

/**
 * A `Name (file:line) — problem` line for every malformed `@platform` tag in the project. An
 * inherited member repeats its base's comment, so each source line is reported once.
 */
function malformedPlatformTags(project: ProjectReflection): string[] {
  const lines = new Map<string, string>();
  for (const reflection of Object.values(project.reflections)) {
    const tags = (reflection.comment?.blockTags ?? []).filter(
      tag => tag.tag === '@platform',
    );
    if (tags.length === 0) continue;
    const errors =
      tags.length > 1
        ? ['more than one @platform tag']
        : parsePlatformTag(
            tags[0]!.content
              .map(part => part.text)
              .join('')
              .trim(),
          ).errors;
    if (errors.length === 0) continue;
    const where = sourceLocation(reflection);
    if (!lines.has(where)) {
      lines.set(
        where,
        `  ${reflection.getFullName()} (${where}) — ${errors.join('; ')}`,
      );
    }
  }
  return [...lines.values()];
}

export function load(app: Application): void {
  app.converter.on(Converter.EVENT_RESOLVE_END, context => {
    restoreRnInternalNames(context.project);
    // An error logged here stops TypeDoc before it writes any output.
    const lines = malformedPlatformTags(context.project);
    if (lines.length > 0) {
      app.logger.error(
        `[typedoc-rns] ${lines.length} @platform tag(s) are malformed. Each entry is ` +
          '`<platform>`, `<platform> >= <version>` or `<platform> <version> - <version>`, ' +
          'comma-separated:\n' +
          lines.join('\n'),
      );
    }
  });

  // TypeDoc resolves `{@link}` targets in its own listener on this event, at priority -300;
  // this one runs after it, so it sees what TypeDoc left unresolved.
  app.converter.on(
    Converter.EVENT_RESOLVE_END,
    context => {
      const lines = resolveCrossFamilyLinks(context.project);
      if (lines.length > 0) {
        app.logger.error(
          `[typedoc-rns] ${lines.length} {@link} target(s) do not resolve. Write a type ` +
            'exported by one family, or one of its members as `Type.member`:\n' +
            lines.join('\n'),
        );
      }
    },
    -400,
  );

  app.renderer.defineRouter('rns', RnsRouter);
  app.renderer.defineTheme('rns', RnsTheme);

  app.renderer.on(MarkdownPageEvent.END, page => {
    if (typeof page.contents !== 'string') return;
    // TypeDoc writes the page itself; its parts (theme.mts `renderFeaturePage`) are ours.
    // `page` is the markdown plugin's `MarkdownPageEvent`, but TypeDoc's types don't say so.
    const {
      root,
      parts = [],
      imports = [],
    } = (page as MarkdownPageEvent).rnsParts ?? ({} as Partial<RnsParts>);
    for (const part of parts) {
      const file = join(
        app.options.getValue('out'),
        root!,
        `${part.path}${app.options.getValue('fileExtension')}`,
      );
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, transform(part.body));
    }
    page.contents = transform(page.contents, { imports });
  });
}
