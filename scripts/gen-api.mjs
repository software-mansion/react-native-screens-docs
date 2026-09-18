// `yarn gen:api` — regenerates the API reference from the library's TSDoc comments.

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { entryPoints } from '../plugins/typedoc-rns/feature-map.mjs';

// A missing entry point means the sibling checkout is absent or the library moved a barrel;
// TypeDoc would report it as a type error among hundreds of others.
const missing = entryPoints.filter(entryPoint => !existsSync(entryPoint));
if (missing.length > 0) {
  console.error(`[gen-api] Entry points not found:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

const typedoc = spawnSync('node_modules/.bin/typedoc', [], { stdio: 'inherit' });

// Fail loudly: a half-updated reference is worse than none.
if (typedoc.status !== 0) {
  console.error(
    '[gen-api] typedoc failed — generated output was NOT updated cleanly.',
  );
  process.exit(typedoc.status ?? 1);
}

console.log('[gen-api] Done.');
