# Documentation Guidelines

Conventions for writing pages in this site. They mirror the patterns the reanimated docs use, adapted to the React Native Screens IA. Live examples of every MDX component below live on the [MDX components cheatsheet](./mdx-components.mdx).

## Page anatomy

Component reference pages (everything under `Components` and `React Navigation Integration`) follow this section order:

1. **Introduction** — one or two sentences on what the component does and when to reach for it.
2. **Reference** — the smallest runnable code sample. Optionally a collapsible `<details>` with the TypeScript type definitions.
3. **Props** (or **Arguments** for hooks/functions) — one `### \`propName\`` subsection per prop, with a short description.
4. **Returns** — only for hooks/functions. Skip on plain components.
5. **Example** — a richer code sample plus a short screen recording or screenshot. Follow [Recording conventions](https://github.com/software-mansion/react-native-screens-docs/blob/main/CONTRIBUTING.md#recording-conventions) in the repo's `CONTRIBUTING.md`.
6. **Remarks** — gotchas, edge cases, things that surprise people. Bullet list is fine.
7. **Platform compatibility** — which platforms the component supports. Use the `Yes` / `No` table pattern.

Guides, fundamentals and contributing pages don't need every section — pick what fits.

## Frontmatter

Keep it minimal. Common fields:

```yaml
---
sidebar_label: Friendly title # only when the H1 isn't a good sidebar entry
sidebar_position: 1 # only when you need to override file-order sorting
slug: / # only on the docs root
---
```

Don't add `title:` — let the H1 drive both the `<title>` tag and the in-page heading.

## Headings

- One H1 per page, matching the sidebar label.
- H2 for the section headers in the page anatomy above.
- H3 / H4 for sub-sections (e.g. one H4 per individual prop). Keep it flat — TOC gets noisy past H3.

## MDX components

These ship via swizzle / preset and can be used in any `.md` / `.mdx` page without an import:

| Component | Usage |
| --- | --- |
| **Admonitions** | `:::note`, `:::tip`, `:::info`, `:::caution`, `:::danger`. Use `caution` for "footguns" and `danger` only for irreversible actions. |
| **`<details>` / `<summary>`** | Native MDX `<details>` is restyled — wrap optional, advanced or long content (type definitions, full prop tables, "why do I need this?" tangents). |
| **Tabs** | Use for parallel install/setup snippets (`<Tabs>` + `<TabItem value="npm">` / `<TabItem value="yarn">`). |
| **Code blocks** | Triple backticks with a language tag. Supported additional languages: `bash`, `diff`, `json`, `mermaid`. Use `diff` for "before/after" snippets — the green/red highlighting is wired up. |
| **Mermaid diagrams** | ```` ```mermaid ```` fenced code blocks render as diagrams (theme-mermaid enabled). Prefer Mermaid over PNG diagrams whenever possible — they stay editable and theme-aware. |

## Code samples

- Always tag the language. Untagged blocks lose syntax highlighting and break copy-button UX.
- For TypeScript snippets that reference public types, prefer `ts` / `tsx`. Use `js` / `jsx` only when the example genuinely doesn't involve types.
- Keep imports realistic — `import { Screen } from 'react-native-screens'`, not `from '../../src'`.
- Highlight changed lines with `// highlight-next-line` or `// highlight-start` / `// highlight-end` comments when walking the reader through a diff.

## Links

- **Within this site** — relative paths to the source `.md` file, not the rendered URL. Example: `[Screen](../components/screen.md)`. Docusaurus rewrites these to the right URL and you get build-time link checking via `onBrokenMarkdownLinks: 'throw'`.
- **To the library source** — link to `software-mansion/react-native-screens` on GitHub. Don't deep-link to a specific commit/branch unless the reference is genuinely tied to it (commit / line will rot).
- **To React Navigation** — link the relevant `reactnavigation.org/docs/...` page. Their docs use the same version concept (7.x, 8.x) — match what we currently support.
- **Anchors** — Docusaurus auto-generates `id`s from headings. `onBrokenAnchors: 'throw'` is on, so renaming a heading breaks links — update them in the same PR.

## Images and videos

- Static images live in `static/img/`. Reference them with leading slash, e.g. `![](/img/screen-anatomy.png)`.
- Screen recordings live in `static/recordings/`. **Always compress before committing** — see [`CONTRIBUTING.md`](https://github.com/software-mansion/react-native-screens-docs/blob/main/CONTRIBUTING.md#recording-conventions) for the ffmpeg command and the 500 KB / 10 s / no-audio constraints.
- Light/dark variants — ship both `featureName_light.mov` and `featureName_dark.mov`, then render with the `<ThemedImage>` (for images) or the equivalent `<ThemedVideo>` swizzle pattern when one lands.
- Never embed third-party CDNs. Everything must live in this repo so docs are reproducible offline.

## Voice and tone

- Present tense, active voice. "`Screen` wraps the screen content in a native container" — not "will wrap" / "is wrapped by".
- Second person for the reader ("you"), library-as-subject for the API ("`Screen` exposes …").
- Avoid hedging ("maybe", "sometimes") in reference sections — be specific or move the caveat into **Remarks**.
- Don't editorialise about other libraries. State facts and link out.

## Platform compatibility

Use a single-row table per page with one column per supported platform:

| iOS | Android | Web | tvOS | visionOS | Windows |
| --- | --- | --- | --- | --- | --- |
| ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ |

Source:

```md
| iOS | Android | Web | tvOS | visionOS | Windows |
| --- | --- | --- | --- | --- | --- |
| ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ |
```

Use ⚠️ when the component works but with caveats — explain those in **Remarks**.

## Versioning

- `docs/` is the next/development version. Most PRs target this folder.
- `versioned_docs/<version>/` is a snapshot for a stable release. Edits here are backports — keep them surgical.
- Cutting a new version is a deliberate action: `yarn docusaurus docs:version 5.x`. Don't run this without coordination — it freezes the entire `docs/` tree under that label.
- Don't introduce a "Migration from N-1 to N" page until the new major actually exists in stable. Future-version migration guides rot quickly.

## When in doubt

Concact the docs site developer — [Szymon Halski](https://github.com/halskiszymon).
