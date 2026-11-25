// `yarn docs:assemble` — adds every version of version-map.json to the site, so the next
// `yarn build` or `yarn start` serves them all with this checkout's code (docusaurus.config.js).
//
//   yarn docs:assemble                     each version from `origin/<branch>`, as last fetched
//   yarn docs:assemble --ref 5.x=<ref>     a version from another git ref (a commit, a tag)
//   yarn docs:assemble --dir 5.x=<folder>  a version from a checkout as it is, uncommitted
//                                          changes included
//   yarn docs:assemble --clean             removes what it added; the site is this checkout alone
//
// Paths, `--dir` included, are relative to the docs repository's root, where yarn runs scripts.
//
// A version's branch holds its content: `docs/`, `sidebars.js`, `api-reference.lock.json` and
// `static/`. It becomes `versioned_docs/version-<name>/` with the lock inside,
// `versioned_sidebars/version-<name>-sidebars.json` and an entry of `versions.json`, which
// Docusaurus reads. All of it is gitignored. Everything is prepared and checked first and then
// moved in, so a failed run leaves the previous assembly as it was.
//
// Static files: every version is served from this checkout's `static/`, so a file it has is
// this checkout's copy for every version (a version's different copy is reported, not used).
// Files only versions have go to `assembled-static/`; two versions with different content at
// the same path fail the run. Dotfiles (`.DS_Store`) are left out.

import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import {
  ASSEMBLED_STATIC_DIR,
  ASSEMBLED_VERSIONS_FILE,
  readVersionMap,
} from './versions.mjs';

const VERSIONED_DOCS = 'versioned_docs';
const VERSIONED_SIDEBARS = 'versioned_sidebars';
const LOCK_FILE = 'api-reference.lock.json';
const STATIC = 'static';
/** What a version's branch must hold; `static/` is optional. */
const CONTENT = ['docs', 'sidebars.js', LOCK_FILE];
/** Gitignored, next to the outputs, so they are moved in rather than copied. */
const WORK_ROOT = '.docs-assemble';

/** Prints `message` and ends the run with status 1. */
function exit(message) {
  console.error(`[docs:assemble] ${message}`);
  process.exit(1);
}

/** Runs `step`, ending the run with its message instead of a stack trace if it throws. */
async function orExit(step) {
  try {
    return await step();
  } catch (error) {
    exit(error.message);
  }
}

// The same root when run with `node` from another folder.
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const { values: options } = await orExit(() =>
  parseArgs({
    options: {
      ref: { type: 'string', multiple: true, default: [] },
      dir: { type: 'string', multiple: true, default: [] },
      clean: { type: 'boolean', default: false },
    },
  }),
);

// What the script writes into the checkout, `versions.json` last: without it Docusaurus ignores
// the rest, so a half-moved assembly is never read.
const OUTPUTS = [
  VERSIONED_DOCS,
  VERSIONED_SIDEBARS,
  relative(process.cwd(), ASSEMBLED_STATIC_DIR),
  relative(process.cwd(), ASSEMBLED_VERSIONS_FILE),
];

if (options.clean) {
  if (options.ref.length > 0 || options.dir.length > 0) {
    exit('--clean takes no --ref or --dir.');
  }
  for (const path of [...[...OUTPUTS].reverse(), WORK_ROOT]) {
    rmSync(path, { recursive: true, force: true });
  }
  console.log('[docs:assemble] Removed the assembled versions.');
  process.exit(0);
}

const versionMap = await orExit(readVersionMap);
const names = versionMap.versions.map(version => version.name);
const refs = await orExit(() => overrides(options.ref, '--ref'));
const dirs = await orExit(() => overrides(options.dir, '--dir'));
for (const name of refs.keys()) {
  if (dirs.has(name)) exit(`${name} is given both --ref and --dir.`);
}

mkdirSync(WORK_ROOT, { recursive: true });
const workDir = mkdtempSync(join(WORK_ROOT, 'run-'));
process.on('exit', () => rmSync(workDir, { recursive: true, force: true }));
// Without a listener Ctrl-C ends Node before the removal above.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () =>
    exit('Interrupted; the previous assembly is unchanged.'),
  );
}

// The new assembly, laid out as it goes into the checkout, and each version's exported content.
const staged = join(workDir, 'assembly');
const exported = join(workDir, 'versions');
/** The version that added each file of `assembled-static/`, by its path there. */
const staticFrom = new Map();

for (const version of versionMap.versions) {
  const { name } = version;
  const ref = refs.get(name) ?? `origin/${version.branch}`;
  let from = dirs.get(name) ?? ref;
  let source;
  if (dirs.has(name)) {
    source = resolve(dirs.get(name));
    const missing = CONTENT.filter(path => !existsSync(join(source, path)));
    if (missing.length > 0)
      exit(`${name}: ${from} has no ${missing.join(', ')}.`);
  } else {
    const commit = await orExit(() => resolveCommit(name, ref, refs.has(name)));
    from = `${ref} (${commit.slice(0, 9)})`;
    source = await orExit(() => exportCommit(name, from, commit));
  }

  const docs = join(staged, VERSIONED_DOCS, `version-${name}`);
  cpSync(join(source, 'docs'), docs, { recursive: true });
  cpSync(join(source, LOCK_FILE), join(docs, LOCK_FILE));

  // The format Docusaurus' own `docs:version` writes: the object the version's `sidebars.js`
  // exports, as JSON. Running the version's code is no new trust: the build compiles and runs
  // its MDX anyway.
  const sidebars = await orExit(async () => {
    let module;
    try {
      module = await import(pathToFileURL(join(source, 'sidebars.js')).href);
    } catch (error) {
      throw new Error(`${name}: ${from}'s sidebars.js: ${error.message}`);
    }
    if (typeof module.default !== 'object' || module.default === null) {
      throw new Error(
        `${name}: ${from}'s sidebars.js exports no sidebars object (module.exports or export default).`,
      );
    }
    return module.default;
  });
  mkdirSync(join(staged, VERSIONED_SIDEBARS), { recursive: true });
  writeFileSync(
    join(staged, VERSIONED_SIDEBARS, `version-${name}-sidebars.json`),
    `${JSON.stringify(sidebars, null, 2)}\n`,
  );

  await orExit(() => addStatic(name, join(source, STATIC)));
  console.log(`[docs:assemble] ${name} from ${from}`);
}
writeFileSync(
  join(staged, relative(process.cwd(), ASSEMBLED_VERSIONS_FILE)),
  `${JSON.stringify(names, null, 2)}\n`,
);

await orExit(replaceAssembly);
console.log(
  '[docs:assemble] Done; `yarn build` or `yarn start` serves every version.',
);

/** `name=value` pairs of a repeated option, by version name. */
function overrides(pairs, option) {
  const result = new Map();
  for (const pair of pairs) {
    const [name, value] = pair.split(/=(.*)/s);
    if (!names.includes(name) || !value) {
      throw new Error(
        `${option} ${pair}: expected <version>=<value> with a version of version-map.json (${names.join(', ')}).`,
      );
    }
    if (result.has(name))
      throw new Error(`${option} is given twice for ${name}.`);
    result.set(name, value);
  }
  return result;
}

/** The commit `ref` names. */
function resolveCommit(name, ref, given) {
  try {
    return git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
  } catch (error) {
    // `--verify --quiet` exits with 1 when the ref is not there; anything else is rethrown.
    if (error.status !== 1) throw error;
    throw new Error(
      given
        ? `${name}: ${ref} is not a commit here.`
        : `${name}: ${ref} is not a commit here. Fetch it (\`git fetch origin\`) or pass --ref ${name}=<ref> or --dir ${name}=<folder>.`,
    );
  }
}

/**
 * The version's content at `commit`, unpacked into the work folder, without touching the
 * checkout or its index; returns its path.
 */
function exportCommit(name, from, commit) {
  const present = git('ls-tree', '--name-only', commit).split('\n');
  const missing = CONTENT.filter(path => !present.includes(path));
  if (missing.length > 0) {
    throw new Error(`${name}: ${from} has no ${missing.join(', ')}.`);
  }
  const folder = join(exported, name);
  const tar = `${folder}.tar`;
  mkdirSync(folder, { recursive: true });
  const paths = [...CONTENT, STATIC].filter(path => present.includes(path));
  git('archive', '--format=tar', `--output=${tar}`, commit, ...paths);
  execFileSync('tar', ['-xf', tar, '-C', folder]);
  return folder;
}

/**
 * Stages the static files of a version that this checkout's `static/` does not have; a file it
 * has is served from `static/` for every version.
 */
function addStatic(name, folder) {
  if (!existsSync(folder)) return;
  const stagedStatic = join(
    staged,
    relative(process.cwd(), ASSEMBLED_STATIC_DIR),
  );
  for (const file of readdirSync(folder, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!file.isFile()) continue;
    const path = relative(folder, join(file.parentPath, file.name));
    if (path.split(sep).some(part => part.startsWith('.'))) continue;
    const content = readFileSync(join(folder, path));
    const own = join(STATIC, path);
    if (existsSync(own)) {
      if (!content.equals(readFileSync(own))) {
        console.warn(
          `[docs:assemble] ${name}: static/${path} differs from this checkout's; every version is served this checkout's copy.`,
        );
      }
      continue;
    }
    const target = join(stagedStatic, path);
    if (staticFrom.has(path)) {
      if (!content.equals(readFileSync(target))) {
        throw new Error(
          `${name}: static/${path} differs from ${staticFrom.get(path)}'s, and every version is served from one copy. Give one of them another name on its branch.`,
        );
      }
      continue;
    }
    staticFrom.set(path, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

/**
 * Moves the staged assembly in, keeping the previous one aside until it is complete and moving
 * it back if a step fails.
 */
function replaceAssembly() {
  const previous = join(workDir, 'previous');
  mkdirSync(previous);
  // Taken out in reverse, `versions.json` first, and put in in order, `versions.json` last.
  const takenOut = [];
  const putIn = [];
  try {
    for (const path of [...OUTPUTS].reverse()) {
      if (!existsSync(path)) continue;
      renameSync(path, join(previous, path));
      takenOut.push(path);
    }
    for (const path of OUTPUTS) {
      if (!existsSync(join(staged, path))) continue;
      renameSync(join(staged, path), path);
      putIn.push(path);
    }
  } catch (error) {
    for (const path of putIn) rmSync(path, { recursive: true, force: true });
    for (const path of takenOut.reverse()) {
      renameSync(join(previous, path), path);
    }
    throw new Error(`Could not move the new assembly in: ${error.message}`);
  }
}

function git(...args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trimEnd();
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('git was not found on PATH.');
    throw error;
  }
}
