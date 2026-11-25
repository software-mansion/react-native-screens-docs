// The docs versions. `main` is the unreleased version, `next`; every other version is a branch
// of this repository (`5.x`, …) whose content `yarn docs:assemble` adds to the site as a
// Docusaurus version. `version-map.json` names them; the site is built from `main`, so `main`'s
// copy is the one that counts. Read by docusaurus.config.js and scripts/docs-assemble.mjs.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const VERSION_MAP_FILE = fileURLToPath(
  new URL('../version-map.json', import.meta.url),
);

/** Docusaurus' list of the versions in `versioned_docs/`, written by `yarn docs:assemble`. */
export const ASSEMBLED_VERSIONS_FILE = fileURLToPath(
  new URL('../versions.json', import.meta.url),
);

/** The static files only an assembled version has, served next to `static/`. */
export const ASSEMBLED_STATIC_DIR = fileURLToPath(
  new URL('../assembled-static', import.meta.url),
);

/** The path segment of the unreleased version, `main`'s own content. */
export const CURRENT_PATH = 'next';
/** The branch of the unreleased version. */
export const CURRENT_BRANCH = 'main';

// A version's name is also its URL path segment, so it never changes once published. Docusaurus
// calls the unreleased version `current`, and it is served as `next`, so neither is a name.
const NAME = /^[0-9a-z][0-9a-z.-]*$/;
const RESERVED_NAMES = ['current', CURRENT_PATH];
const BRANCH = /^[\w./-]+$/;
// The banners Docusaurus shows above a version's pages.
const BANNERS = ['none', 'unreleased', 'unmaintained'];

/**
 * @typedef {{ label: string, banner: string }} CurrentVersion
 * @typedef {{ name: string, branch: string, label: string, banner: string }} Version
 * @typedef {{ current: CurrentVersion, versions: Version[], latest: string }} VersionMap
 *   `versions` newest first; `latest` is the version the site opens on.
 */

/** `version-map.json`, checked, so a mistake in it fails the build. */
export function readVersionMap() {
  const map = readJsonFile(VERSION_MAP_FILE);
  const problems = [
    ...banner(map.current?.banner, 'current'),
    ...text(map.current?.label, 'current.label'),
  ];
  if (!Array.isArray(map.versions) || map.versions.length === 0) {
    problems.push('`versions` must list at least one version');
  } else {
    map.versions.forEach((version, i) => {
      const at = `versions[${i}]`;
      if (typeof version !== 'object' || version === null) {
        problems.push(`${at} must be an object`);
        return;
      }
      if (
        !NAME.test(version.name ?? '') ||
        RESERVED_NAMES.includes(version.name)
      ) {
        problems.push(
          `${at}.name "${version.name}" must match ${NAME} and not be ${RESERVED_NAMES.map(name => `"${name}"`).join(' or ')}`,
        );
      }
      if (
        !BRANCH.test(version.branch ?? '') ||
        version.branch === CURRENT_BRANCH
      ) {
        problems.push(
          `${at}.branch "${version.branch}" must match ${BRANCH} and not be "${CURRENT_BRANCH}"`,
        );
      }
      problems.push(...text(version.label, `${at}.label`));
      problems.push(...banner(version.banner, at));
    });
    const names = map.versions.map(version => version?.name);
    const repeated = names.filter((name, i) => names.indexOf(name) !== i);
    if (repeated.length > 0) {
      problems.push(`version names repeat: ${repeated.join(', ')}`);
    }
    if (!names.includes(map.latest)) {
      problems.push(`\`latest\` "${map.latest}" is not one of the versions`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`version-map.json:\n  ${problems.join('\n  ')}`);
  }
  return /** @type {VersionMap} */ (map);
}

/**
 * The versions `yarn docs:assemble` added, newest first, or `undefined` when there are none and
 * the site is this branch's content alone.
 *
 * @returns {string[] | undefined}
 */
export function readAssembledVersions() {
  if (!existsSync(ASSEMBLED_VERSIONS_FILE)) return undefined;
  const versions = readJsonFile(ASSEMBLED_VERSIONS_FILE);
  if (!Array.isArray(versions)) {
    throw new Error(
      `${ASSEMBLED_VERSIONS_FILE} must list version names; run \`yarn docs:assemble\` again.`,
    );
  }
  return versions;
}

/** The JSON in `file`, with the file named in the error when it does not parse. */
export function readJsonFile(/** @type {string | URL} */ file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${file}: ${error.message}`);
  }
}

function text(value, at) {
  return typeof value === 'string' && value.trim() !== ''
    ? []
    : [`${at} must be a non-empty string`];
}

function banner(value, at) {
  return BANNERS.includes(value)
    ? []
    : [`${at}.banner "${value}" must be one of ${BANNERS.join(', ')}`];
}
