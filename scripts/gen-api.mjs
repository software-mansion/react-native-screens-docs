// `yarn gen:api` — regenerates the API reference from the library's TSDoc comments.
// `gen:api` type-checks the generator before this runs, so a type error stops it before any
// output is deleted.

import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  FEATURES,
  entryPoints,
  outputFile,
  outputRoot,
} from '../plugins/typedoc-rns/feature-map.mts';
import { RN_INTERNAL_NAME } from '../plugins/typedoc-rns/rn-internal-names.mts';

const DOCS = 'docs';

// A missing entry point means the sibling checkout is absent or the library moved a barrel;
const missing = entryPoints.filter(entryPoint => !existsSync(entryPoint));
if (missing.length > 0) {
  console.error(`[gen-api] Entry points not found:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

// A regenerated family must not keep pages of types the library no longer exports, and the
// wipe is targeted because hand-written pages live in the same tree.
for (const feature of Object.values(FEATURES)) {
  rmSync(join(DOCS, outputRoot(feature)), { recursive: true, force: true });
}

const typedoc = spawnSync('node_modules/.bin/typedoc', [], {
  stdio: 'inherit',
});

// Fail loudly: a half-updated reference is worse than none.
if (typedoc.status !== 0) {
  console.error(
    '[gen-api] typedoc failed — generated output was NOT updated cleanly.',
  );
  process.exit(typedoc.status ?? 1);
}

const notWritten = Object.values(FEATURES)
  .map(feature => join(DOCS, `${outputFile(feature)}.mdx`))
  .filter(file => !existsSync(file));
if (notWritten.length > 0) {
  console.error(
    `[gen-api] Missing generated files:\n  ${notWritten.join('\n  ')}`,
  );
  process.exit(1);
}

// The generator restores React Native's `____X_Internal` names to their public spelling on
// the model (plugins/typedoc-rns/rn-internal-names.mts); one left in the output is a name it
// does not know or a type it does not reach.
const leaked = Object.values(FEATURES)
  .flatMap(feature => {
    const root = join(DOCS, outputRoot(feature));
    return readdirSync(root, { recursive: true, encoding: 'utf8' })
      .filter(file => file.endsWith('.mdx'))
      .map(file => join(root, file));
  })
  .filter(file => RN_INTERNAL_NAME.test(readFileSync(file, 'utf8')));
if (leaked.length > 0) {
  console.error(
    `[gen-api] React Native internal type names in the output:\n  ${leaked.join('\n  ')}`,
  );
  process.exit(1);
}

console.log('[gen-api] Done.');
