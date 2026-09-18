import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { MarkdownPageEvent } from 'typedoc-plugin-markdown';

import { RnsRouter } from './router.mjs';
import { RnsTheme } from './theme.mjs';
import { transform } from './transform.mjs';

export function load(app) {
  app.renderer.defineRouter('rns', RnsRouter);
  app.renderer.defineTheme('rns', RnsTheme);

  app.renderer.on(MarkdownPageEvent.END, page => {
    if (typeof page.contents !== 'string') return;
    // TypeDoc writes the page itself; its parts (theme.mjs `renderFeaturePage`) are ours.
    const { root, parts = [], imports = [] } = page.rnsParts ?? {};
    for (const part of parts) {
      const file = join(app.options.getValue('out'), root, `${part.path}${app.options.getValue('fileExtension')}`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, transform(part.body));
    }
    page.contents = transform(page.contents, { imports });
  });
}
