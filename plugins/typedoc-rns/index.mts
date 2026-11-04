import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  Converter,
  type Application,
  type DeclarationReflection,
  type ProjectReflection,
  type SignatureReflection,
} from 'typedoc';
import { MarkdownPageEvent } from 'typedoc-plugin-markdown';

import type { RnsParts } from './theme.mts';

import { parsePlatformTag } from './feature-map.mts';
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
    // Only declarations and signatures have sources.
    const source = (reflection as DeclarationReflection | SignatureReflection)
      .sources?.[0];
    const where = source
      ? `${source.fileName}:${source.line}`
      : 'unknown source';
    const key = source ? where : `reflection ${reflection.id}`;
    if (!lines.has(key)) {
      lines.set(
        key,
        `  ${reflection.getFullName()} (${where}) — ${errors.join('; ')}`,
      );
    }
  }
  return [...lines.values()];
}

export function load(app: Application): void {
  // An error logged here stops TypeDoc before it writes any output.
  app.converter.on(Converter.EVENT_RESOLVE_END, context => {
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
