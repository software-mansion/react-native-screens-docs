import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Application } from 'typedoc';
import { MarkdownPageEvent } from 'typedoc-plugin-markdown';

import type { RnsParts } from './theme.mjs';

import { RnsRouter } from './router.mjs';
import { RnsTheme } from './theme.mjs';
import { transform } from './transform.mjs';

export function load(app: Application): void {
  app.renderer.defineRouter('rns', RnsRouter);
  app.renderer.defineTheme('rns', RnsTheme);

  app.renderer.on(MarkdownPageEvent.END, page => {
    if (typeof page.contents !== 'string') return;
    // TypeDoc writes the page itself; its parts (theme.mts `renderFeaturePage`) are ours.
    // `page` is the markdown plugin's `MarkdownPageEvent`, but TypeDoc's types don't say so.
    const { root, parts = [], imports = [] } =
      (page as MarkdownPageEvent).rnsParts ?? ({} as Partial<RnsParts>);
    for (const part of parts) {
      const file = join(app.options.getValue('out'), root!, `${part.path}${app.options.getValue('fileExtension')}`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, transform(part.body));
    }
    page.contents = transform(page.contents, { imports });
  });
}
