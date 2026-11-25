import React, { useMemo } from 'react';
import CodeBlock from '@theme-original/CodeBlock';
import { TypeLinksContext } from '@theme/CodeBlock/TypeLinksContext';

/**
 * The stock code block, giving its tokens (CodeBlock/Line/Token) the type links that
 * plugins/remark-type-links.js put on the block, if any.
 */
export default function CodeBlockWithTypeLinks({
  'data-type-links': typeLinks,
  ...props
}) {
  const links = useMemo(
    () => (typeLinks ? new Map(Object.entries(JSON.parse(typeLinks))) : null),
    [typeLinks],
  );
  return (
    <TypeLinksContext.Provider value={links}>
      <CodeBlock {...props} />
    </TypeLinksContext.Provider>
  );
}
