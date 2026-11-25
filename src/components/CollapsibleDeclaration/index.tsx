import React, { useId, useState } from 'react';
import styles from './styles.module.css';

type CollapsibleDeclarationProps = {
  /**
   * Two code blocks: the declaration with `{ … }` in place of its members, then the whole
   * declaration.
   */
  children: React.ReactNode;
};

/**
 * An interface's or an object type's declaration in a generated API reference, shown with
 * `{ … }` in place of its members, which are documented below it. The arrow on the block's
 * bottom edge expands it to the whole declaration and collapses it back. The generator writes
 * it with both blocks (plugins/typedoc-rns/declaration.mts); registered as an MDX component
 * (src/theme/MDXComponents.js).
 */
export default function CollapsibleDeclaration({
  children,
}: CollapsibleDeclarationProps) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const [collapsed, whole] = React.Children.toArray(children).filter(
    React.isValidElement,
  );
  if (!whole) return <>{children}</>;
  return (
    <div className={styles.container}>
      <div id={id}>{expanded ? whole : collapsed}</div>
      {/* The name stays the same; `aria-expanded` tells the state. */}
      <button
        type="button"
        className={styles.toggle}
        aria-controls={id}
        aria-expanded={expanded}
        aria-label="Whole declaration"
        title={expanded ? 'Collapse declaration' : 'Expand declaration'}
        onClick={() => setExpanded(value => !value)}>
        <svg
          className={expanded ? styles.up : undefined}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </div>
  );
}
