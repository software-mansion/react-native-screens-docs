import React from 'react';
import styles from './styles.module.css';

// The entries the API reference generator writes; Babel drops the type-only import.
import type {
  PlatformEntry,
  TagPlatform,
} from '../../../plugins/typedoc-rns/feature-map.mts';

type PlatformHeadingProps = {
  children: React.ReactNode;
  platforms: PlatformEntry[];
};

const PLATFORM_LABELS: Record<TagPlatform, string> = {
  android: 'Android',
  ios: 'iOS',
  tvos: 'tvOS',
  visionos: 'visionOS',
  web: 'Web',
  windows: 'Windows',
};

/** `≥ 13` from the first version alone, `13–18` with the last one too. */
function versions({ from, to }: PlatformEntry): string | undefined {
  if (!from) return undefined;
  return to ? `${from}–${to}` : `≥ ${from}`;
}

function PlatformChip(entry: PlatformEntry) {
  const range = versions(entry);
  return (
    <span className={styles.chip} data-platform={entry.platform}>
      <span className={styles.platform}>{PLATFORM_LABELS[entry.platform]}</span>
      {range && <span className={styles.version}>{range}</span>}
    </span>
  );
}

/**
 * A heading in a generated API reference — a component section, a type, or a prop, field or
 * method — followed by a chip for each platform of its `@platform` tag
 * (`android >= 21` → **Android** ≥ 21, `ios 13 - 18` → **iOS** 13–18), in the tag's order.
 * The heading stays a Markdown heading, so its anchor and the table of contents keep working.
 * Registered as an MDX component (src/theme/MDXComponents.js).
 */
export default function PlatformHeading({
  children,
  platforms,
}: PlatformHeadingProps) {
  return (
    <div className={`platform-heading ${styles.row}`}>
      {children}
      {platforms.map(entry => (
        <PlatformChip key={entry.platform} {...entry} />
      ))}
    </div>
  );
}
