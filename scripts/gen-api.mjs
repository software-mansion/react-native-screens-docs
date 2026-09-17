// `yarn gen:api` — regenerates the API reference from the library's TSDoc comments.

import { spawnSync } from 'node:child_process';

const typedoc = spawnSync('node_modules/.bin/typedoc', [], { stdio: 'inherit' });

// Fail loudly: a half-updated reference is worse than none.
if (typedoc.status !== 0) {
  console.error(
    '[gen-api] typedoc failed — generated output was NOT updated cleanly.',
  );
  process.exit(typedoc.status ?? 1);
}

console.log('[gen-api] Done.');
