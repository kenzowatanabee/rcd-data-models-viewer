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

function textOf(node: HastNode): string {
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(textOf).join('');
}

/** Rehype plugin: gives headings the ids GitHub would, so `#anchors` work. */
export function rehypeHeadingIds() {
  return (tree: HastNode): void => {
    const slug = createSlugger();
    const visit = (node: HastNode) => {
      if (node.type === 'element' && HEADING.test(node.tagName ?? '')) {
        node.properties = { ...node.properties, id: slug(textOf(node)) };
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
  };
}
