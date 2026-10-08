import { TOCItems } from '@swmansion/t-rex-ui';

// A TOC item's `value` is the heading's HTML (t-rex-ui renders it as such), so a line break
// opportunity goes in as a `<wbr>` element — in the text only, never inside a tag — rather
// than as a character that would end up in the label's text.
const WBR = '<wbr>';

/**
 * Optional members render as `name?` in the page; the TOC only needs the name. Identifiers
 * may wrap between their camelCase words (`TabsHost<wbr>Direction`, `UI<wbr>View`), but not
 * before a capital run that ends the word, so `iOS`, `tvOS` and `PropsIOS` stay whole.
 */
function tocLabel(value) {
  return String(value ?? '')
    .replace(/\?$/, '')
    .split(/(<[^>]*>)/)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part
            .replace(
              /([a-z0-9])([A-Z])(?![A-Z]*(?:[^A-Za-z]|$))/g,
              `$1${WBR}$2`,
            )
            .replace(/([A-Z]+)([A-Z][a-z])/g, `$1${WBR}$2`),
    )
    .join('');
}

function forToc(items = []) {
  return items.map(item => ({
    ...item,
    value: tocLabel(item.value),
    children: item.children ? forToc(item.children) : item.children,
  }));
}

export default function TOCItemsWrapper(props) {
  return <TOCItems {...props} toc={forToc(props.toc)} />;
}
