# Contributing

Thanks for helping with the React Native Screens docs.

## Local setup

```bash
yarn install
yarn start
```

`yarn start` runs Docusaurus in dev mode at `http://localhost:3000/react-native-screens/`. `yarn build` produces a production bundle in `build/`.

## Documentation structure

- `docs/` — current/next version, tracks `main`. Edit here for changes targeting the upcoming release.
- `versioned_docs/<version>/` — stable maintenance versions. Backports go into the matching folder. (No versions cut yet — added when 5.0.0 stable ships.)
- `sidebars.js` — manual sidebar that mirrors the IA. Update it whenever you add or rename a page.

## Pull requests

- Branch off `main`.
- Fill out the PR template, including the related react-native-screens PR if the docs change follows a source change.

## Recording conventions

Screen recordings demonstrate components. Keep them small, silent, and consistent.

### ffmpeg compression

Run every recording through:

```bash
ffmpeg -i input.mov \
  -vf "scale=600:-2,fps=30" \
  -c:v libx264 -crf 28 -preset slow \
  -movflags +faststart -an \
  output.mov
```

### Constraints

- Max 500 KB per file
- Max 10 seconds
- No audio (`-an`)
- H.264 baseline profile

### Light/dark variants

If a feature renders differently across color schemes, ship both:

- `featureName_light.mov`
- `featureName_dark.mov`

Store recordings under `static/recordings/`.
