// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const lightCodeTheme = require('./src/theme/CodeBlock/highlighting-light.js');
const darkCodeTheme = require('./src/theme/CodeBlock/highlighting-dark.js');

import { topbarBannerReservationScript } from '@swmansion/t-rex-ui/topbar-banner'; // eslint-disable-line import/first
import { TOP_BAR_BANNER } from './src/components/topbarBanner.config.ts'; // eslint-disable-line import/first
import {
  ASSEMBLED_STATIC_DIR,
  CURRENT_BRANCH,
  CURRENT_PATH,
  readAssembledVersions,
  readJsonFile,
  readVersionMap,
} from './scripts/versions.mjs'; // eslint-disable-line import/first
import { fileURLToPath } from 'node:url'; // eslint-disable-line import/first

const firstBannerZone = TOP_BAR_BANNER.zones[0];
const bannerReservationHeadTags = firstBannerZone
  ? [
      {
        tagName: 'script',
        attributes: { type: 'text/javascript' },
        innerHTML: topbarBannerReservationScript(
          firstBannerZone.zoneId,
          firstBannerZone.contentId,
          TOP_BAR_BANNER.hiddenPaths,
        ),
      },
    ]
  : [];

// Without `versions.json`, `docs/` is the only version, at `/docs/…`. With it, written by
// `yarn docs:assemble`, each version of version-map.json has its own path, `/docs/5.x/…`, and
// `docs/` itself is `/docs/next/…`.
const versionMap = readVersionMap();
const assembledVersions = readAssembledVersions();
if (assembledVersions) {
  const mapped = versionMap.versions.map(version => version.name);
  if (assembledVersions.join() !== mapped.join()) {
    throw new Error(
      `versions.json (${assembledVersions.join(', ')}) does not match version-map.json ` +
        `(${mapped.join(', ')}); run \`yarn docs:assemble\` again.`,
    );
  }
}

/** @type {import('@docusaurus/plugin-content-docs').Options['versions']} */
const versions = assembledVersions
  ? Object.fromEntries([
      [
        'current',
        {
          label: versionMap.current.label,
          path: CURRENT_PATH,
          banner: versionMap.current.banner,
        },
      ],
      // An explicit path, so a version's URLs stay the same when it stops being the latest.
      ...versionMap.versions.map(version => [
        version.name,
        { label: version.label, path: version.name, banner: version.banner },
      ]),
    ])
  : // `docs/` alone is published as the latest release.
    {
      current: {
        label: versionMap.versions.find(
          version => version.name === versionMap.latest,
        )?.label,
        banner: 'none',
      },
    };

// Where the docs are, relative to baseUrl; an assembled version's pages are under
// `/docs/<name>/`.
const DOCS_PATH = '/docs/';
const latestPath = `${DOCS_PATH}${versionMap.latest}/`;
/** Every assembled version but the latest. */
const olderVersionPaths = [CURRENT_PATH, ...(assembledVersions ?? [])]
  .filter(name => name !== versionMap.latest)
  .map(name => `${DOCS_PATH}${name}/`);

/** The branch of the repository that holds a version's content. */
function branchOf(/** @type {string} */ versionName) {
  return versionName === 'current'
    ? CURRENT_BRANCH
    : versionMap.versions.find(version => version.name === versionName)?.branch;
}

/**
 * The library commit each version's API reference is generated from, by version name;
 * ReferenceHeading links the reference's source to it. `yarn gen:api` writes a branch's lock,
 * and `yarn docs:assemble` copies it next to the version's content.
 */
const apiReferenceLocks = Object.fromEntries([
  ['current', readJson('./api-reference.lock.json')],
  ...(assembledVersions ?? []).map(name => [
    name,
    readJson(`./versioned_docs/version-${name}/api-reference.lock.json`),
  ]),
]);

function readJson(/** @type {string} */ path) {
  return readJsonFile(fileURLToPath(new URL(path, import.meta.url)));
}

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'React Native Screens',
  favicon: 'img/favicon.ico',

  url: 'https://docs.swmansion.com',

  baseUrl: '/react-native-screens-docs/',

  organizationName: 'software-mansion',
  projectName: 'react-native-screens-docs',

  // TODO: remove once the site is ready for public traffic and the
  // docs.swmansion.com DNS swap lands. Until then, keep the deploy
  // hidden from search engines.
  noIndex: true,

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
    mermaid: true,
  },

  themes: ['@docusaurus/theme-mermaid'],

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          breadcrumbs: true,
          sidebarPath: require.resolve('./sidebars.js'),
          sidebarCollapsible: false,
          // Links on the type names in the API reference's code blocks.
          remarkPlugins: [require('./plugins/remark-type-links')],
          // A page's source on its version's branch, where `docs/` holds it.
          editUrl: ({ version, docPath }) =>
            `https://github.com/software-mansion/react-native-screens-docs/edit/${branchOf(version)}/docs/${docPath}`,
          lastVersion: assembledVersions ? versionMap.latest : 'current',
          versions,
        },
        theme: {
          customCss: require.resolve('./src/css/index.css'),
        },
      }),
    ],
  ],

  customFields: { apiReferenceLocks },

  // `static/` is served for every version, so a file there is the copy every version gets;
  // `assembled-static/` holds the files only assembled versions have (scripts/docs-assemble.mjs).
  staticDirectories: [
    'static',
    ...(assembledVersions ? [ASSEMBLED_STATIC_DIR] : []),
  ],

  headTags: bannerReservationHeadTags,

  clientModules: [require.resolve('./src/clientModules/topbarBannerRefresh.ts')],

  plugins: [
    [
      require('./plugins/swm-geo'),
      // llms.txt lists the latest version only, not a copy of every page per version.
      {
        excludePaths: assembledVersions ? olderVersionPaths : [],
      },
    ],
    // `/docs/…`, every page's URL before versions, leads to the same page in the latest version,
    // keeping `?search#hash`. A page the latest version does not have gets no redirect. Only
    // `yarn build` writes the redirects; `yarn start` does not serve them.
    assembledVersions && [
      '@docusaurus/plugin-client-redirects',
      {
        createRedirects: (/** @type {string} */ path) =>
          path.startsWith(latestPath)
            ? DOCS_PATH + path.slice(latestPath.length)
            : undefined,
      },
    ],
    process.env.NODE_ENV === 'production' && [
      '@docusaurus/plugin-google-tag-manager',
      {
        containerId: 'GTM-MRHMWWNL',
      },
    ],
  ].filter(Boolean),

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: 'img/og-image.png',
      metadata: [
        { name: 'og:image:width', content: '1200' },
        { name: 'og:image:height', content: '630' },
      ],
      colorMode: {
        respectPrefersColorScheme: true,
      },
      navbar: {
        hideOnScroll: true,
        logo: {
          alt: 'React Native Screens logo',
          src: 'img/logo.svg',
          srcDark: 'img/logo-dark.svg',
        },
        items: [
          // The Stack page of the version being read; elsewhere, of the version last picked in the
          // dropdown, or the latest one.
          {
            type: 'doc',
            docId: 'react/containers/stack/index',
            label: 'Docs',
            position: 'right',
          },
          {
            type: 'docsVersionDropdown',
            position: 'right',
            dropdownActiveClassDisabled: true,
          },
          {
            href: 'https://github.com/software-mansion/react-native-screens/',
            position: 'right',
            className: 'header-github',
            'aria-label': 'GitHub repository',
          },
        ],
      },
      footer: {
        style: 'light',
        links: [],
        copyright:
          'All trademarks and copyrights belong to their respective owners.',
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
        additionalLanguages: ['bash', 'diff', 'json', 'mermaid'],
      },
      // TODO: replace placeholders with real DocSearch credentials once
      // Algolia approval lands. Required so preset-classic activates
      // @docusaurus/theme-search-algolia and `@theme/SearchTranslations`
      // alias resolves during build.
      algolia: {
        appId: 'PLACEHOLDER_APP_ID',
        apiKey: 'PLACEHOLDER_API_KEY',
        indexName: 'react-native-screens',
      },
    }),
};

module.exports = config;
