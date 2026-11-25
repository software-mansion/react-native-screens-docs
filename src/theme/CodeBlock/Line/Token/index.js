import React, { useContext } from 'react';
import Link from '@docusaurus/Link';
import { TypeLinksContext } from '@theme/CodeBlock/TypeLinksContext';
import styles from './styles.module.css';

// Splitting on a capture group keeps the identifiers, at the odd indices.
const IDENTIFIER = /([A-Za-z_$][\w$]*)/;

// The same rule is in plugins/typedoc-rns/code-links.mts, which checks that every type name is
// linked. Prism gives keys and type names the same token type, so the text around the name
// decides.
const BEFORE_KEY = /(?:^|[{(,;])\s*$/;
const AFTER_KEY = /^\s*\??:/;

/** Text that is not code: a comment, or a string outside a template's `${…}`. */
function isText(types) {
  return (
    types.includes('comment') ||
    (types.includes('string') && !types.includes('interpolation'))
  );
}

/**
 * A key or a parameter name: it starts its line or follows `{`, `(`, `,` or `;`, and a `:` or
 * `?:` follows it. `A extends B ? C : D` keeps `C`, which follows `?`.
 */
function isKeyOrParameter(lineText, start, end) {
  return (
    BEFORE_KEY.test(lineText.slice(0, start)) &&
    AFTER_KEY.test(lineText.slice(end))
  );
}

/**
 * A token of a code block. In a block with type links (src/theme/CodeBlock), the names of the
 * documented types it shows link to their entries, keeping the token's colour.
 */
export default function CodeBlockLineToken({ line, token, ...props }) {
  const links = useContext(TypeLinksContext);
  const text = props.children;
  if (!links || typeof text !== 'string' || isText(token.types)) {
    return <span {...props} />;
  }
  const parts = text.split(IDENTIFIER);
  if (!parts.some((part, index) => index % 2 === 1 && links.has(part))) {
    return <span {...props} />;
  }

  const lineText = line.map(lineToken => lineToken.content).join('');
  let offset = line
    .slice(0, line.indexOf(token))
    .reduce((length, lineToken) => length + lineToken.content.length, 0);
  const children = parts.map((part, index) => {
    const start = offset;
    offset += part.length;
    return index % 2 === 1 &&
      links.has(part) &&
      !isKeyOrParameter(lineText, start, offset) ? (
      <Link key={index} to={links.get(part)} className={styles.link}>
        {part}
      </Link>
    ) : (
      part
    );
  });
  return <span {...props}>{children}</span>;
}
