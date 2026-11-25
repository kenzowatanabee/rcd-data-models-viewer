import { hastText, type HastNode } from './headingIds';

export interface OutlineItem {
  id: string;
  text: string;
  /** 2 or 3: the outline lists sections and their subsections. */
  depth: 2 | 3;
}

/**
 * The h2/h3 headings of a rendered tree, in order, with the ids that
 * rehypeHeadingIds gave them. Run after it.
 */
export function collectOutline(tree: HastNode): OutlineItem[] {
  const items: OutlineItem[] = [];
  const visit = (node: HastNode) => {
    if (
      node.type === 'element' &&
      (node.tagName === 'h2' || node.tagName === 'h3')
    ) {
      const id = node.properties?.id;
      const text = hastText(node).trim();
      if (typeof id === 'string' && text !== '') {
        items.push({ id, text, depth: node.tagName === 'h2' ? 2 : 3 });
      }
      return;
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
  return items;
}

/** Rehype plugin: hands the outline to `collect` once ids are set. */
export function rehypeOutline(options: {
  collect: (items: OutlineItem[]) => void;
}) {
  return (tree: HastNode): void => options.collect(collectOutline(tree));
}

/**
 * Holds the outline a render collected until an effect hands it on; the
 * Markdown pipeline runs during render, where state cannot be set.
 */
export class OutlineSink {
  items: OutlineItem[] = [];
  readonly collect = (items: OutlineItem[]): void => {
    this.items = items;
  };
}

export const sameOutline = (a: OutlineItem[], b: OutlineItem[]) =>
  a.length === b.length &&
  a.every(
    (item, i) =>
      item.id === b[i]?.id &&
      item.text === b[i]?.text &&
      item.depth === b[i]?.depth,
  );

/**
 * The section being read: the last heading whose top has scrolled to within
 * `offset` of the top of the scroller. `tops` are relative to the scroller's
 * top; null for headings not laid out (inside a closed `<details>`). At the
 * very bottom, the last heading on screen wins, since short final sections
 * can never reach the top. -1 when there is no heading.
 */
export function activeHeading(
  tops: readonly (number | null)[],
  offset: number,
  viewportHeight: number,
  atBottom: boolean,
): number {
  let active = -1;
  let first = -1;
  tops.forEach((top, index) => {
    if (top === null) return;
    if (first === -1) first = index;
    if (top <= offset) active = index;
    else if (atBottom && top < viewportHeight) active = index;
  });
  return active === -1 ? first : active;
}

const ATX_TITLE = /^#[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;

/**
 * Takes the doc's leading `# Title` out of the body so the header can show
 * it once. Only a level-1 heading before any other content counts.
 */
export function splitTitle(body: string): {
  title: string | null;
  body: string;
} {
  const lines = body.split('\n');
  let index = 0;
  while (index < lines.length && (lines[index] ?? '').trim() === '') {
    index += 1;
  }
  const match = ATX_TITLE.exec((lines[index] ?? '').replace(/\r$/, ''));
  if (!match?.[1]) return { title: null, body };
  return {
    title: match[1],
    body: lines.slice(index + 1).join('\n'),
  };
}

export interface InlinePart {
  code: boolean;
  text: string;
}

/**
 * A title's text split into code spans and plain text, with `*` emphasis
 * markers dropped: enough for titles, which hold little else.
 */
export function inlineParts(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const pattern = /(`+)([\s\S]*?[^`])\1(?!`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  const plain = (value: string) => {
    // Underscores stay: they are part of identifiers like RCD_SORT_REC
    const cleaned = value.replace(/\*+/g, '');
    if (cleaned !== '') parts.push({ code: false, text: cleaned });
  };
  while ((match = pattern.exec(text)) !== null) {
    plain(text.slice(last, match.index));
    parts.push({ code: true, text: (match[2] ?? '').trim() });
    last = pattern.lastIndex;
  }
  plain(text.slice(last));
  return parts;
}

/** The heading's text as GitHub slugs it: code spans without backticks. */
export const plainTitle = (title: string) =>
  inlineParts(title)
    .map((part) => part.text)
    .join('');
