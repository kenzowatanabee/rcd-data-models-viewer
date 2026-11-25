import { plainTitle, splitTitle } from '../ui/outline';
import { createSlugger } from '../ui/slug';

export interface Heading {
  /** The anchor the viewer gives the heading. */
  id: string;
  text: string;
  depth: number;
}

const FRONT_MATTER = /^﻿?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;
const ATX = /^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * A heading's text as the rendered page shows it: links and images by their
 * text, code spans without backticks, emphasis and inline HTML dropped.
 * Underscores inside words stay, as in RCD_SORT_REC.
 */
export function headingText(raw: string): string {
  const text = raw
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`+([^`]*)`+/g, '$1')
    .replace(/\*+/g, '')
    .replace(/(^|[^\p{L}\p{N}])_+([^_]+?)_+(?=[^\p{L}\p{N}]|$)/gu, '$1$2')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1');
  return text.trim();
}

/**
 * The `##` to `####` headings of a doc with the anchors the viewer renders:
 * the front-matter and leading `# Title` are left out (the title's slug is
 * still taken first, as the page does), and fenced code is skipped.
 */
export function extractHeadings(markdown: string, maxDepth = 4): Heading[] {
  const body = markdown.replace(FRONT_MATTER, '');
  const split = splitTitle(body);
  const slug = createSlugger();
  if (split.title !== null) slug(plainTitle(split.title));
  const headings: Heading[] = [];
  let fence: string | null = null;
  for (const line of split.body.split('\n')) {
    const clean = line.replace(/\r$/, '');
    const marker = FENCE.exec(clean)?.[1];
    if (marker !== undefined) {
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (fence !== null) continue;
    const match = ATX.exec(clean);
    if (!match?.[1] || match[2] === undefined) continue;
    const text = headingText(match[2]);
    if (text === '') continue;
    // Every heading takes a slug, so later duplicates get the right suffix
    const id = slug(text);
    const depth = match[1].length;
    if (depth >= 2 && depth <= maxDepth) headings.push({ id, text, depth });
  }
  return headings;
}
