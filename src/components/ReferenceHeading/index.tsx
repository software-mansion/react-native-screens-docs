import React from 'react';
import styles from './styles.module.css';

// The entries the API reference generator writes; Babel drops the type-only import.
import type {
  PlatformEntry,
  PlatformName,
} from '../../../plugins/typedoc-rns/feature-map.mts';

type ReferenceHeadingProps = {
  children: React.ReactNode;
  platforms?: PlatformEntry[];
  /** The declaration in the library repository, at its line. */
  source?: string;
};

const PLATFORM_LABELS: Record<PlatformName, string> = {
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

/** `</>`: a link to the declaration, opened in a new tab. */
function SourceLink({ href }: { href: string }) {
  return (
    <a
      className={styles.source}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="View source on GitHub"
      aria-label="View source on GitHub">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    </a>
  );
}

/**
 * A heading in a generated API reference — a component section, a type, or a prop, field or
 * method — followed by a chip for each platform of its `@platform` tag
 * (`android >= 21` → **Android** ≥ 21, `ios 13 - 18` → **iOS** 13–18), in the tag's order, and
 * a link to its declaration in the library repository. The heading stays a Markdown heading,
 * so its anchor and the table of contents keep working. Registered as an MDX component
 * (src/theme/MDXComponents.js).
 */
export default function ReferenceHeading({
  children,
  platforms = [],
  source,
}: ReferenceHeadingProps) {
  return (
    <div className={`reference-heading ${styles.row}`}>
      {children}
      {platforms.map(entry => (
        <PlatformChip key={entry.platform} {...entry} />
      ))}
      {source && <SourceLink href={source} />}
    </div>
  );
}
