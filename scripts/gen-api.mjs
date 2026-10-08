// `yarn gen:api` — regenerates the API reference from the library's TSDoc comments.
// `tsc` builds the generator into plugins/typedoc-rns/dist before this runs (see `gen:api`).

import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  FEATURES,
  entryPoints,
  outputFile,
  outputRoot,
} from '../plugins/typedoc-rns/dist/feature-map.mjs';

const DOCS = 'docs';

// A missing entry point means the sibling checkout is absent or the library moved a barrel;
const missing = entryPoints.filter(entryPoint => !existsSync(entryPoint));
if (missing.length > 0) {
  console.error(`[gen-api] Entry points not found:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

// A regenerated family must not keep pages of types the library no longer exports, so its
// generated folder is cleared first — only that folder, as hand-written pages live in the same
// tree. It is moved aside rather than deleted, so a failed run can put it back.
const BACKUP = '.gen-api-backup';
// Deleting a tree is not atomic, renaming is: a backup is renamed here before it is deleted,
// so a run killed mid-delete leaves a partial copy only under this name, which is never
// restored — just removed by the next run.
const DISCARD = `${BACKUP}.discard`;

/** Drops the backup without ever leaving a half-deleted one under BACKUP. */
function dropBackup() {
  if (existsSync(BACKUP)) renameSync(BACKUP, DISCARD);
  rmSync(DISCARD, { recursive: true, force: true });
}

rmSync(DISCARD, { recursive: true, force: true });
const roots = Object.values(FEATURES).map(feature => outputRoot(feature));

// A backup left by an interrupted run holds the output from before that run: put it back
// first, so the folders below are moved aside in their last good state. A root without a
// backup was never moved, so what is in docs/ is still its original.
if (existsSync(BACKUP)) {
  for (const root of roots) {
    if (!existsSync(join(BACKUP, root))) continue;
    rmSync(join(DOCS, root), { recursive: true, force: true });
    renameSync(join(BACKUP, root), join(DOCS, root));
  }
  dropBackup();
}

const moved = new Set();
for (const root of roots) {
  if (!existsSync(join(DOCS, root))) continue;
  mkdirSync(dirname(join(BACKUP, root)), { recursive: true });
  renameSync(join(DOCS, root), join(BACKUP, root));
  moved.add(root);
}

/** Puts every generated folder back as it was before this run, then exits. */
function fail(message, code = 1) {
  for (const root of roots) {
    rmSync(join(DOCS, root), { recursive: true, force: true });
    if (moved.has(root)) renameSync(join(BACKUP, root), join(DOCS, root));
  }
  dropBackup();
  console.error(
    `${message}\n[gen-api] The previous output was put back unchanged.`,
  );
  process.exit(code);
}

// So stack traces from the generator point at the .mts files, not at dist/.
const typedoc = spawnSync('node_modules/.bin/typedoc', [], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, '--enable-source-maps']
      .filter(Boolean)
      .join(' '),
  },
});

// A half-updated reference is worse than the previous one.
if (typedoc.status !== 0) {
  fail('[gen-api] typedoc failed.', typedoc.status ?? 1);
}

const notWritten = Object.values(FEATURES)
  .map(feature => join(DOCS, `${outputFile(feature)}.mdx`))
  .filter(file => !existsSync(file));
if (notWritten.length > 0) {
  fail(`[gen-api] Missing generated files:\n  ${notWritten.join('\n  ')}`);
}

dropBackup();
console.log('[gen-api] Done.');
