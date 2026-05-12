// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  tutorialSidebar: [
    {
      type: 'doc',
      id: 'intro',
      label: 'Introduction',
      className: 'sidebar-top-link',
    },
    {
      type: 'category',
      label: 'Fundamentals',
      items: [
        'fundamentals/getting-started',
        'fundamentals/installation',
        'fundamentals/configuration',
      ],
    },
    {
      type: 'category',
      label: 'Components',
      items: [
        'components/screen',
        'components/screen-container',
        'components/screen-stack',
        'components/screen-stack-header-config',
        'components/tabs',
        'components/bottom-tabs',
        'components/bottom-tabs-screen',
        'components/tabs-item',
        'components/split',
        'components/full-window-overlay',
      ],
    },
    {
      type: 'category',
      label: 'React Navigation Integration',
      items: [
        'react-navigation/native-stack',
        'react-navigation/bottom-tabs',
        'react-navigation/drawer',
        'react-navigation/migration-from-js-stack',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      items: [
        'guides/performance',
        'guides/web-support',
        'guides/platform-quirks',
        'guides/troubleshooting',
        'guides/migration-4-to-5',
      ],
    },
    {
      type: 'category',
      label: 'Experimental',
      items: ['experimental/index'],
    },
    {
      type: 'category',
      label: 'Contributing',
      items: [
        'contributing/repository-overview',
        'contributing/setup',
        'contributing/documentation-guidelines',
        'contributing/mdx-components',
        'contributing/code-style',
      ],
    },
  ],
};

module.exports = sidebars;
