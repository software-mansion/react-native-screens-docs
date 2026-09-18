// @ts-check

// Information architecture:
//
//   Fundamentals
//   React Containers         Stack / Tabs / Split
//   React Components/Modals  ScrollToTopGuard / SafeAreaView / FullWindowOverlay / FormSheet / PageSheet / ScrollViewMarker
//   React Common Types
//   Core Containers
//   Core Components/Modals
//   Guides
//   Meta
//
// The sidebar is at most two levels deep: section → page. A family (Stack, Tabs, …) is ONE
// page, `<dir>/index.mdx`, assembled from partials — hand-written `_*-empty.md` parts
// (Overview, Guides) and the generated `api-reference/` folder (`yarn gen:api`). The page's
// table of contents (h2/h3: Overview, Guides → guide titles, API Reference → Host / Screen
// / … / Types) is its navigation; props and types sit at h4 and below, so they are
// linkable anchors but never navigation entries.
//
// Hand-written parts that still need content are named `*-empty`.

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  tutorialSidebar: [
    {
      type: 'category',
      label: 'Fundamentals',
      items: [
        'fundamentals/intro-empty',
        'fundamentals/installation-empty',
        'fundamentals/getting-started-empty',
        'fundamentals/configuration-empty',
      ],
    },
    {
      type: 'category',
      label: 'React Containers',
      items: [
        'react/containers/stack/index',
        'react/containers/tabs/index',
        'react/containers/split/index',
      ],
    },
    {
      type: 'category',
      label: 'React Components/Modals',
      items: [
        'react/components/scroll-to-top-guard/index',
        'react/components/safe-area-view/index',
        'react/components/full-window-overlay/index',
        'react/components/form-sheet/index',
        'react/components/page-sheet/index',
        'react/components/scroll-view-marker/index',
      ],
    },
    // A single page, not a section: a plain link with nothing nested under it, styled
    // like the section labels around it (src/css/overrides.css).
    {
      type: 'doc',
      id: 'react/common-types/index',
      label: 'React Common Types',
      className: 'sidebar-section-link',
    },
    {
      type: 'category',
      label: 'Core Containers',
      items: ['core/containers/tabs/index'],
    },
    {
      type: 'category',
      label: 'Core Components/Modals',
      items: ['core/components/overview-empty'],
    },
    {
      type: 'category',
      label: 'Guides',
      items: [
        'guides/how-to-build-a-navigator/index',
        'guides/platform-quirks-empty',
        'guides/troubleshooting-empty',
        'guides/migration-4-to-5-empty',
      ],
    },
    {
      type: 'category',
      label: 'Meta',
      items: [
        'meta/contributing/index',
        'meta/releasing-empty',
        'meta/compatibility-empty',
        'meta/architecture/index',
      ],
    },
  ],
};

module.exports = sidebars;
