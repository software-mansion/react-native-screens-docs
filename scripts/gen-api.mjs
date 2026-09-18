// `yarn gen:api` — regenerates the API reference from the library's TSDoc comments.

import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  FEATURES,
  entryPoints,
  outputFile,
  outputRoot,
} from '../plugins/typedoc-rns/feature-map.mjs';

const DOCS = 'docs';

// A missing entry point means the sibling checkout is absent or the library moved a barrel;
// TypeDoc would report it as a type error among hundreds of others.
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

const typedoc = spawnSync('node_modules/.bin/typedoc', [], { stdio: 'inherit' });

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
  console.error(`[gen-api] Missing generated files:\n  ${notWritten.join('\n  ')}`);
  process.exit(1);
}

console.log('[gen-api] Done.');
