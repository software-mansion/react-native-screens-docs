// `yarn gen:api` — regenerates the API reference from the library's TSDoc comments.
// `gen:api` type-checks the generator first, so a type error stops the run before anything is
// fetched or generated.
//
// Which library it reads:
//   yarn gen:api                 the sibling checkout `../react-native-screens` as it is
//   yarn gen:api --lib <path>    another local checkout as it is
//   yarn gen:api --ref <ref>     a tag, branch or full commit SHA fetched from GitHub
// Source links point at the library commit the reference is generated from, recorded in
// `api-reference.lock.json`. The checkout's path reaches TypeDoc as the `RNS_LIB_REPO`
// environment variable (feature-map.mts); setting it in the shell works like `--lib`.
// Paths, `--lib` included, are relative to the docs repository's root, where yarn runs scripts.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

import { RN_INTERNAL_NAME } from '../plugins/typedoc-rns/rn-internal-names.mts';
import {
  checkoutRef,
  checkoutWarnings,
  libraryCommit,
  REPOSITORY,
  WORK_DIR,
} from './library.mjs';

const DOCS = 'docs';
const LOCK_FILE = 'api-reference.lock.json';

/** Prints `message` and ends the run with status 1. */
function exit(message) {
  console.error(`[gen-api] ${message}`);
  process.exit(1);
}

/** Runs `step`, ending the run with its message instead of a stack trace if it throws. */
function orExit(step) {
  try {
    return step();
  } catch (error) {
    exit(error.message);
  }
}

// The same root when run with `node` from another folder.
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const {
  values: { ref, lib },
} = orExit(() =>
  parseArgs({ options: { ref: { type: 'string' }, lib: { type: 'string' } } }),
);
// parseArgs rejects a bare `--ref`, but takes `--ref=` as an empty value.
if (ref === '') exit('--ref needs a value.');
if (lib === '') exit('--lib needs a value.');
if (ref !== undefined && lib !== undefined) {
  exit('Pass either --ref or --lib, not both.');
}

// The feature map reads the checkout's path when it is loaded, in this process and in
// TypeDoc's, so it is set before the map is imported.
if (ref !== undefined) {
  process.env.RNS_LIB_REPO = orExit(() => checkoutRef(ref));
} else if (lib !== undefined) {
  process.env.RNS_LIB_REPO = lib;
}
const { FEATURES, LIB_REPO, entryPoints, outputFile, outputRoot } =
  await import('../plugins/typedoc-rns/feature-map.mts');

const commit = orExit(() => libraryCommit(LIB_REPO));
console.log(`[gen-api] Generating from ${LIB_REPO} at ${commit}.`);
// A fetched ref is exactly what GitHub has; a local checkout may not match it.
if (ref === undefined) {
  for (const warning of orExit(() => checkoutWarnings(LIB_REPO, commit))) {
    console.warn(`[gen-api] Warning: ${warning}`);
  }
}

// A missing entry point means the library moved or removed a barrel the feature map names, or
// the checkout is from before a family existed.
const missing = entryPoints.filter(entryPoint => !existsSync(entryPoint));
if (missing.length > 0) {
  exit(`Entry points not found:\n  ${missing.join('\n  ')}`);
}

// TypeDoc writes into a staging folder, and its families replace those in `docs` only after
// every check below passes, so a failed check changes neither the reference nor the lock. The
// folder is on the same disk as `docs`, so the families are moved in by renaming, not copied.
mkdirSync(WORK_DIR, { recursive: true });
const staging = mkdtempSync(join(WORK_DIR, 'output-'));
process.on('exit', () => rmSync(staging, { recursive: true, force: true }));
// Without a listener Ctrl-C ends Node before the removal above. TypeDoc gets the signal too,
// and its failure below ends the run.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => exit('Interrupted.'));
}

const typedoc = spawnSync('node_modules/.bin/typedoc', ['--out', staging], {
  stdio: 'inherit',
});
if (typedoc.error) {
  exit(`TypeDoc could not be started: ${typedoc.error.message}`);
}
if (typedoc.signal) {
  exit('TypeDoc was interrupted; the API reference was not changed.');
}
if (typedoc.status !== 0) {
  exit('TypeDoc failed; the API reference was not changed.');
}

const features = Object.values(FEATURES);
const roots = features.map(outputRoot);
const generated = readdirSync(staging, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile())
  .map(entry => relative(staging, join(entry.parentPath, entry.name)));

// Only the families' folders are moved into the docs, so a file outside them would be lost
// without a word, e.g. the `_media` copy the markdown plugin makes of a file a comment links.
const stray = generated.filter(
  file => !roots.some(root => file.startsWith(`${root}/`)),
);
if (stray.length > 0) {
  exit(
    `Generated files outside the families' folders:\n  ${stray.join('\n  ')}`,
  );
}

const notWritten = features
  .map(feature => `${outputFile(feature)}.mdx`)
  .filter(file => !generated.includes(file));
if (notWritten.length > 0) {
  exit(`Missing generated files:\n  ${notWritten.join('\n  ')}`);
}

// The generator restores React Native's `____X_Internal` names to their public spelling on
// the model (plugins/typedoc-rns/rn-internal-names.mts); one left in the output is a name it
// does not know or a type it does not reach.
const leaked = generated.filter(
  file =>
    file.endsWith('.mdx') &&
    RN_INTERNAL_NAME.test(readFileSync(join(staging, file), 'utf8')),
);
if (leaked.length > 0) {
  exit(
    `React Native internal type names in the output:\n  ${leaked.join('\n  ')}`,
  );
}

// Each family's folder is replaced as a whole, so it keeps no page of a type the library no
// longer exports; only those folders, because hand-written pages live in the same tree.
for (const root of roots) {
  rmSync(join(DOCS, root), { recursive: true, force: true });
  mkdirSync(dirname(join(DOCS, root)), { recursive: true });
  renameSync(join(staging, root), join(DOCS, root));
}

const lock = {
  repository: REPOSITORY,
  commit,
  // The tag or branch `--ref` named, when it is not the SHA itself.
  ...(ref !== undefined && ref !== commit && { ref }),
};
writeFileSync(LOCK_FILE, `${JSON.stringify(lock, null, 2)}\n`);

console.log('[gen-api] Done.');
