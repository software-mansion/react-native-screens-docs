import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Converter, type Application } from 'typedoc';
import { MarkdownPageEvent } from 'typedoc-plugin-markdown';

import type { RnsParts } from './theme.mts';

import { commentProblems } from './gates.mts';
import { resolveCrossFamilyLinks } from './links.mts';
import { restoreRnInternalNames } from './rn-internal-names.mts';
import { RnsRouter } from './router.mts';
import { RnsTheme } from './theme.mts';
import { transform } from './transform.mts';

// The pull requests where the doc comment rules are written.
const RULES =
  'RFC-1947 https://github.com/software-mansion/react-native-screens-labs/pull/1947, ' +
  'RFC-1960 https://github.com/software-mansion/react-native-screens-labs/pull/1960';

export function load(app: Application): void {
  app.converter.on(Converter.EVENT_RESOLVE_END, context => {
    restoreRnInternalNames(context.project);
    // An error logged here stops TypeDoc before it writes any output.
    const lines = commentProblems(context.project);
    if (lines.length > 0) {
      app.logger.error(
        `[typedoc-rns] ${lines.length} doc comment problem(s). The rules: ${RULES}\n` +
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
