// The library checkout the API reference is generated from, and the commit its source links
// point at. Used by `yarn gen:api`.

import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY =
  'https://github.com/software-mansion/react-native-screens';

/** A git remote URL of {@link REPOSITORY}, over HTTPS or SSH. */
const REPOSITORY_REMOTE =
  /github\.com[/:]software-mansion\/react-native-screens(\.git)?\/?$/;

/**
 * `gen:api`'s gitignored working folder: the checkout `--ref` fetches and TypeDoc's output
 * until it is checked. Resolved from this file rather than the working directory, because
 * what is in it gets deleted.
 */
export const WORK_DIR = fileURLToPath(new URL('../.lib', import.meta.url));

/**
 * The checkout `gen:api --ref` fetches into, kept between runs so its `node_modules` carry
 * over. The script owns it: a run discards any change made in it.
 */
const REF_CHECKOUT = join(WORK_DIR, 'react-native-screens');

/** What the generated reference depends on besides the commit: the sources and the types. */
const INPUTS = [
  'src',
  'tsdoc.json',
  'tsconfig.json',
  'package.json',
  'yarn.lock',
];

function runGit(args) {
  try {
    // Trimmed at the end only: a `status --porcelain` line can begin with a space.
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trimEnd();
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('git was not found on PATH.');
    }
    throw error;
  }
}

function git(dir, ...args) {
  return runGit(['-C', dir, ...args]);
}

/**
 * Whether `dir` is the root of its own git checkout. Git looks for a repository in the parent
 * folders too, so a folder without one, or with a broken one, would otherwise answer for the
 * repository around it — the docs repository for `.lib`.
 */
function isCheckoutRoot(dir) {
  try {
    return (
      realpathSync(git(dir, 'rev-parse', '--show-toplevel')) ===
      realpathSync(dir)
    );
  } catch (error) {
    // Git exits with a status when it finds no repository; a thrown message is anything else.
    if (error.status === undefined) throw error;
    return false;
  }
}

/** The commit checked out in `dir`; the source links and the lock file name it. */
export function libraryCommit(dir) {
  if (!existsSync(dir)) {
    throw new Error(
      `The library checkout ${dir} does not exist. Clone the library there, or pass --lib <path> or --ref <ref>.`,
    );
  }
  if (!isCheckoutRoot(dir)) {
    throw new Error(
      `${dir} is not the root of a git checkout, so there is no commit for the source links to point at.`,
    );
  }
  try {
    return git(dir, 'rev-parse', '--verify', 'HEAD');
  } catch {
    throw new Error(`${dir} has no commit checked out.`);
  }
}

/**
 * Checks out `ref` of the library — a tag, a branch or a full commit SHA — into the reused
 * checkout, installs its dependencies and returns the checkout's path.
 */
export function checkoutRef(ref) {
  // Git would read a value starting with `-` as one of its options.
  if (ref.startsWith('-')) {
    throw new Error(`"${ref}" is not a tag, branch or commit.`);
  }
  // A checkout left broken, e.g. by an interrupted first run, is set up again.
  if (existsSync(REF_CHECKOUT) && !isCheckoutRoot(REF_CHECKOUT)) {
    rmSync(REF_CHECKOUT, { recursive: true, force: true });
  }
  if (!existsSync(REF_CHECKOUT)) {
    runGit(['init', '--quiet', REF_CHECKOUT]);
  }
  try {
    // One commit is enough: TypeDoc reads the files and the links name the commit.
    git(
      REF_CHECKOUT,
      'fetch',
      '--quiet',
      '--depth=1',
      '--no-tags',
      REPOSITORY,
      ref,
    );
  } catch (error) {
    throw new Error(
      `Could not fetch "${ref}" from ${REPOSITORY}. A commit must be given as its full SHA.\n${(error.stderr || error.message).trim()}`,
    );
  }
  git(REF_CHECKOUT, 'checkout', '--quiet', '--force', '--detach', 'FETCH_HEAD');
  // Leaves what the library ignores, so `node_modules` stays installed.
  git(REF_CHECKOUT, 'clean', '--quiet', '--force', '-d');
  // TypeDoc type-checks the library, so it needs the types of its dependencies; the library's
  // own build (`prepare`) is not needed.
  execFileSync('yarn', ['install', '--immutable', '--mode=skip-build'], {
    cwd: REF_CHECKOUT,
    stdio: 'inherit',
    // Yarn turns hardened mode on by itself for pull requests in CI, where it fails the install.
    env: { ...process.env, YARN_ENABLE_HARDENED_MODE: '0' },
  });
  // Relative to the working directory, as the sibling checkout is, so messages stay short.
  return relative(process.cwd(), REF_CHECKOUT);
}

/**
 * Why the source links generated from a local checkout may not show what the reference
 * describes: changes that are not committed, or a commit the library's GitHub repository
 * may not have. Only branches of a remote pointing at that repository count, as fetched
 * last; a fork's branch or a local tag does not.
 */
export function checkoutWarnings(dir, commit) {
  const warnings = [];
  const changed = git(dir, 'status', '--porcelain', '--', ...INPUTS)
    .split('\n')
    .filter(Boolean)
    .map(line => line.slice(3));
  if (changed.length > 0) {
    const shown = changed.slice(0, 3).join(', ');
    const more = changed.length > 3 ? ` and ${changed.length - 3} more` : '';
    warnings.push(
      `${dir} has uncommitted changes (${shown}${more}); the source links point at ${commit}, which does not have them.`,
    );
  }
  const remotes = new Set(
    git(dir, 'remote', '--verbose')
      .split('\n')
      .map(line => line.split(/\s+/))
      .filter(([, url]) => url && REPOSITORY_REMOTE.test(url))
      .map(([name]) => name),
  );
  if (remotes.size === 0) {
    warnings.push(
      `${dir} has no remote pointing at ${REPOSITORY}, so whether it has ${commit} is not checked.`,
    );
  } else if (
    ![...remotes].some(remote =>
      git(
        dir,
        'branch',
        '--remotes',
        '--list',
        `${remote}/*`,
        '--contains',
        commit,
      ),
    )
  ) {
    warnings.push(
      `${commit} is on no branch of ${REPOSITORY} that ${dir} has fetched; if it is not pushed there, the source links lead nowhere.`,
    );
  }
  return warnings;
}
