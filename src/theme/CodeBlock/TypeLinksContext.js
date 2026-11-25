import { createContext } from 'react';

/**
 * The type links of the code block being rendered, a Map of name → URL
 * (plugins/remark-type-links.js); `null` outside a block that has some.
 */
export const TypeLinksContext = createContext(null);
