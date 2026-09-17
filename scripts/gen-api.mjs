// Regenerates the API reference from the library's TSDoc comments.
//
//   yarn gen:api
//
// Runs TypeDoc with typedoc.config.mjs. A failed run must never leave half-updated pages
// behind, so anything but a clean exit stops the script with TypeDoc's own status.

import { spawnSync } from 'node:child_process';

const typedoc = spawnSync('node_modules/.bin/typedoc', [], { stdio: 'inherit' });

if (typedoc.status !== 0) {
  console.error(
    '[gen-api] typedoc failed — generated output was NOT updated cleanly.',
  );
  process.exit(typedoc.status ?? 1);
}

console.log('[gen-api] Done.');
