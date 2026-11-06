// @ts-check

// Information architecture:
//
//   React Containers           Stack / Tabs / Split
//   React Components & Modals  ScrollToTopGuard / SafeAreaView / FormSheet / ContainedModal / ScrollViewMarker
//   React Common Types
//   Meta
//
// The sidebar is at most two levels deep: section → page. A family (Stack, Tabs, …) is ONE
// page, `<dir>/index.mdx`, assembled from partials — hand-written `_*.md` parts (Overview)
// and the generated `api-reference/` folder (`yarn gen:api`). The page's table of contents
// (h2/h3: Overview, API Reference → Host / Screen / … / Types) is its navigation; props and
// types sit at h4 and below, so they are linkable anchors but never navigation entries.

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  tutorialSidebar: [
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
      label: 'React Components & Modals',
      items: [
        'react/components/scroll-to-top-guard/index',
        'react/components/safe-area-view/index',
        'react/components/form-sheet/index',
        'react/components/contained-modal/index',
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
      label: 'Meta',
      items: ['meta/contributing/index', 'meta/architecture/index'],
    },
  ],
};

module.exports = sidebars;
