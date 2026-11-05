// Fails the build when a page has two elements with the same `id`: a link to that anchor
// would land on the first. Runs after `docusaurus build`, on the HTML it wrote, so it covers
// the hand-written headings next to the generated ones.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BUILD = 'build';

const problems = [];
for (const name of readdirSync(BUILD, { recursive: true })) {
  if (!name.endsWith('.html')) continue;
  const counts = new Map();
  for (const [, id] of readFileSync(join(BUILD, name), 'utf8').matchAll(
    /\sid="([^"]+)"/g,
  )) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const repeated = [...counts].filter(([, count]) => count > 1);
  if (repeated.length > 0) {
    problems.push(
      `  ${name}: ${repeated.map(([id, count]) => `#${id} ×${count}`).join(', ')}`,
    );
  }
}

if (problems.length > 0) {
  console.error(
    `[check-duplicate-ids] ${problems.length} page(s) repeat an element id:\n${problems.join('\n')}`,
  );
  process.exit(1);
}
