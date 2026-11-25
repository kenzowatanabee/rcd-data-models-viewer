import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import type { Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { rehypeHeadingIds } from './headingIds';
import { SANITIZE_SCHEMA, remarkHtmlAllowlist } from './htmlAllowlist';
import { rehypeOutline, type OutlineItem } from './outline';

type PluggableList = NonNullable<Options['rehypePlugins']>;

export interface PipelineOptions {
  /** Heading texts that come before the body (the title). */
  reserved?: readonly string[];
  collect?: (items: OutlineItem[]) => void;
}

/**
 * The Markdown pipeline, in one place so tests run exactly what the page
 * runs: GFM; allowlisted raw HTML parsed, then sanitised; GitHub heading
 * ids; the outline. Ids are set after sanitising, so headings keep GitHub's
 * ids while raw `id`s get the `user-content-` prefix.
 */
export function markdownPlugins(options: PipelineOptions = {}): {
  remark: PluggableList;
  rehype: PluggableList;
} {
  return {
    remark: [remarkGfm, remarkHtmlAllowlist],
    rehype: [
      rehypeRaw,
      [rehypeSanitize, SANITIZE_SCHEMA],
      [rehypeHeadingIds, { reserved: options.reserved ?? [] }],
      [rehypeOutline, { collect: options.collect ?? (() => undefined) }],
    ],
  };
}
