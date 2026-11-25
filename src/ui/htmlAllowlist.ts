import type { Options as SanitizeSchema } from 'rehype-sanitize';

/**
 * Raw HTML the docs may use, and nothing else. A Markdown `html` node is kept
 * as HTML only when every tag in it is listed here with only the listed
 * attributes; any other node is shown as its literal text, so prose such as
 * `<export date>` stays visible instead of vanishing.
 */
const RAW_TAGS: Record<string, readonly string[]> = {
  details: ['open'],
  summary: [],
  br: [],
  i: [],
  b: [],
  sub: [],
  sup: [],
  kbd: [],
  // `<a id="dn"></a>` marks link targets in table rows (the glossary); no href
  a: ['id'],
};

const TAG =
  /<(\/?)([A-Za-z][A-Za-z0-9-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/y;
const ATTRIBUTE =
  /\s+([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gy;
const COMMENT = /<!--[\s\S]*?-->/y;
/** An `id` that can only be a fragment target. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

function allowedAttributes(tag: string, attributes: string): boolean {
  const allowed = RAW_TAGS[tag] ?? [];
  ATTRIBUTE.lastIndex = 0;
  let match: RegExpExecArray | null;
  let end = 0;
  while ((match = ATTRIBUTE.exec(attributes)) !== null) {
    end = ATTRIBUTE.lastIndex;
    const name = (match[1] ?? '').toLowerCase();
    if (!allowed.includes(name)) return false;
    const value = match[2] ?? match[3] ?? match[4];
    if (name === 'id' && (value === undefined || !SAFE_ID.test(value))) {
      return false;
    }
    if (name === 'open' && value !== undefined && value !== '') return false;
  }
  return end === attributes.length;
}

/**
 * True when `html` (the value of a Markdown html node) contains only
 * allowlisted tags and comments, with text between them.
 */
export function isAllowedHtml(html: string): boolean {
  let sawMarkup = false;
  let index = 0;
  while (index < html.length) {
    const lt = html.indexOf('<', index);
    if (lt === -1) break;
    COMMENT.lastIndex = lt;
    const comment = COMMENT.exec(html);
    if (comment !== null) {
      sawMarkup = true;
      index = COMMENT.lastIndex;
      continue;
    }
    TAG.lastIndex = lt;
    const tag = TAG.exec(html);
    if (tag === null) return false;
    const name = (tag[2] ?? '').toLowerCase();
    if (!(name in RAW_TAGS)) return false;
    const closing = tag[1] === '/';
    const attributes = tag[3] ?? '';
    if (closing && attributes.trim() !== '') return false;
    if (!closing && !allowedAttributes(name, attributes)) return false;
    sawMarkup = true;
    index = TAG.lastIndex;
  }
  return sawMarkup;
}

/** The mdast fields this plugin reads; avoids depending on @types/mdast. */
export interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
}

/** Remark plugin: html nodes outside the allowlist become plain text. */
export function remarkHtmlAllowlist() {
  return (tree: MdNode): void => {
    const visit = (node: MdNode) => {
      if (node.type === 'html' && !isAllowedHtml(node.value ?? '')) {
        node.type = 'text';
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
  };
}

/** Elements remark-gfm produces from Markdown itself. */
const MARKDOWN_TAGS = [
  'a',
  'blockquote',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'img',
  'input',
  'li',
  'ol',
  'p',
  'pre',
  'section',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
];

/**
 * Second line of defence after the remark plugin: whatever reaches the HTML
 * tree must be a Markdown element or an allowlisted tag, with no event
 * handlers, styles or script URLs. Raw `id`s get the `user-content-` prefix so
 * they cannot clash with the app's own ids.
 */
export const SANITIZE_SCHEMA: SanitizeSchema = {
  tagNames: [...new Set([...MARKDOWN_TAGS, ...Object.keys(RAW_TAGS)])],
  attributes: {
    a: ['href', 'title', 'id'],
    img: ['src', 'alt', 'title'],
    code: [['className', /^language-[\w-]+$/]],
    ol: ['start'],
    li: [['className', 'task-list-item']],
    ul: [['className', 'contains-task-list']],
    input: [['type', 'checkbox'], ['disabled', true], 'checked'],
    td: ['align'],
    th: ['align'],
    details: ['open'],
  },
  protocols: { href: ['http', 'https', 'mailto'], src: ['http', 'https'] },
  clobber: ['id'],
  clobberPrefix: 'user-content-',
  strip: ['script', 'style'],
  required: { input: { type: 'checkbox', disabled: true } },
  ancestors: {
    tbody: ['table'],
    td: ['table'],
    th: ['table'],
    thead: ['table'],
    tr: ['table'],
    summary: ['details'],
  },
};
