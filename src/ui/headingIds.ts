import { createSlugger } from './slug';

/** The few hast fields this plugin reads; avoids depending on @types/hast. */
export interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const HEADING = /^h[1-6]$/;

export function hastText(node: HastNode): string {
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(hastText).join('');
}

export interface HeadingIdOptions {
  /**
   * Heading texts that come before the body on GitHub but are shown
   * elsewhere here (the doc's title), so later duplicates keep GitHub's
   * `-1` suffix.
   */
  reserved?: readonly string[];
}

/** Rehype plugin: gives headings the ids GitHub would, so `#anchors` work. */
export function rehypeHeadingIds(options: HeadingIdOptions = {}) {
  return (tree: HastNode): void => {
    const slug = createSlugger();
    for (const text of options.reserved ?? []) slug(text);
    const visit = (node: HastNode) => {
      if (node.type === 'element' && HEADING.test(node.tagName ?? '')) {
        node.properties = { ...node.properties, id: slug(hastText(node)) };
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
  };
}
