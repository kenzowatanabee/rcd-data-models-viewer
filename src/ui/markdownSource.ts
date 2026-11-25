/**
 * A small line tokenizer for showing a doc's Markdown source: front-matter
 * keys, headings, code fences, links, inline code and table pipes. It only
 * labels slices of the text; joined back, the tokens of a line are the line.
 */
import { createSlugger } from './slug';

export type TokenKind =
  | 'text'
  | 'fm-delim'
  | 'fm-key'
  | 'fm-punct'
  | 'fm-comment'
  | 'heading-mark'
  | 'heading'
  | 'fence'
  | 'code'
  | 'inline-code'
  | 'link-punct'
  | 'link-text'
  | 'link-url'
  | 'table-pipe'
  | 'mark'
  | 'html';

export interface Token {
  kind: TokenKind;
  text: string;
}

/**
 * The file's lines as shown, without line endings; a final newline does
 * not add an empty last line. `lines.join(eol)` plus that newline is the
 * file again.
 */
export function sourceLines(text: string): string[] {
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const HEADING = /^( {0,3})(#{1,6})(?=\s|$)(.*)$/;
const FM_KEY = /^(\s*)([^\s:#][^:#]*?)(:)(\s|$)(.*)$/;
const FM_LIST = /^(\s*)(-)(\s.*)?$/;
const MARK = /^(\s*)([-*+]|\d+[.)]|>)(\s+)(.*)$/;

/** Inline code, links and table pipes inside a line of prose. */
export function inlineTokens(text: string, table = false): Token[] {
  const tokens: Token[] = [];
  const push = (kind: TokenKind, value: string) => {
    if (value === '') return;
    const last = tokens[tokens.length - 1];
    if (last !== undefined && last.kind === kind && kind === 'text') {
      last.text += value;
    } else {
      tokens.push({ kind, text: value });
    }
  };
  let i = 0;
  while (i < text.length) {
    const char = text[i] ?? '';
    if (char === '`') {
      const run = /^`+/.exec(text.slice(i))?.[0] ?? '`';
      const close = text.indexOf(run, i + run.length);
      if (close !== -1) {
        push('inline-code', text.slice(i, close + run.length));
        i = close + run.length;
        continue;
      }
      push('text', run);
      i += run.length;
      continue;
    }
    if (char === '[') {
      const link = /^\[([^\]\n]*)\]\(([^)\s]*(?:\s+"[^"]*")?)\)/.exec(
        text.slice(i),
      );
      if (link) {
        push('link-punct', '[');
        push('link-text', link[1] ?? '');
        push('link-punct', '](');
        push('link-url', link[2] ?? '');
        push('link-punct', ')');
        i += link[0].length;
        continue;
      }
    }
    if (char === '<') {
      const tag = /^<\/?[A-Za-z][^<>\n]*>|^<!--.*?-->/.exec(text.slice(i));
      if (tag) {
        push('html', tag[0]);
        i += tag[0].length;
        continue;
      }
    }
    if (table && char === '|') {
      push('table-pipe', '|');
      i += 1;
      continue;
    }
    if (char === '\\' && i + 1 < text.length) {
      push('text', text.slice(i, i + 2));
      i += 2;
      continue;
    }
    push('text', char);
    i += 1;
  }
  return tokens;
}

/** Same delimiters as frontMatter.ts: `---` lines at the very top. */
function frontMatterEnd(lines: readonly string[]): number {
  if ((lines[0] ?? '').replace(/^﻿/, '') !== '---') return -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === '---') return i;
  }
  return -1;
}

/** Tokens for each line of `sourceLines(text)`. */
export function tokenizeSource(text: string): Token[][] {
  const lines = sourceLines(text);
  const fmEnd = frontMatterEnd(lines);
  let fence: { char: string; length: number } | null = null;
  return lines.map((line, index): Token[] => {
    if (fmEnd !== -1 && index <= fmEnd) {
      if (index === 0 || index === fmEnd)
        return [{ kind: 'fm-delim', text: line }];
      if (/^\s*#/.test(line)) return [{ kind: 'fm-comment', text: line }];
      const item = FM_LIST.exec(line);
      if (item) {
        return compact([
          { kind: 'text', text: item[1] ?? '' },
          { kind: 'fm-punct', text: item[2] ?? '' },
          { kind: 'text', text: item[3] ?? '' },
        ]);
      }
      const key = FM_KEY.exec(line);
      if (key) {
        return compact([
          { kind: 'text', text: key[1] ?? '' },
          { kind: 'fm-key', text: key[2] ?? '' },
          { kind: 'fm-punct', text: key[3] ?? '' },
          { kind: 'text', text: `${key[4] ?? ''}${key[5] ?? ''}` },
        ]);
      }
      return compact([{ kind: 'text', text: line }]);
    }
    const fenceMatch = FENCE.exec(line);
    if (fence !== null) {
      const closing =
        fenceMatch !== null &&
        (fenceMatch[2] ?? '').startsWith(fence.char) &&
        (fenceMatch[2] ?? '').length >= fence.length &&
        (fenceMatch[3] ?? '').trim() === '';
      if (closing) {
        fence = null;
        return [{ kind: 'fence', text: line }];
      }
      return compact([{ kind: 'code', text: line }]);
    }
    if (fenceMatch) {
      const marks = fenceMatch[2] ?? '```';
      fence = { char: marks[0] ?? '`', length: marks.length };
      return [{ kind: 'fence', text: line }];
    }
    const heading = HEADING.exec(line);
    if (heading) {
      return compact([
        {
          kind: 'heading-mark',
          text: `${heading[1] ?? ''}${heading[2] ?? ''}`,
        },
        { kind: 'heading', text: heading[3] ?? '' },
      ]);
    }
    if (/^\s*\|/.test(line)) return inlineTokens(line, true);
    const mark = MARK.exec(line);
    if (mark) {
      return compact([
        { kind: 'text', text: mark[1] ?? '' },
        { kind: 'mark', text: mark[2] ?? '' },
        { kind: 'text', text: mark[3] ?? '' },
        ...inlineTokens(mark[4] ?? ''),
      ]);
    }
    return inlineTokens(line);
  });
}

const compact = (tokens: Token[]) => tokens.filter((t) => t.text !== '');

/** A heading's text as the rendered page shows it, for its id. */
export function headingText(raw: string): string {
  return raw
    .replace(/\s+#+\s*$/, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*]/g, '')
    .trim();
}

export interface SourceHeading {
  /** 1-based line number. */
  line: number;
  depth: number;
  text: string;
  /** The id the rendered page gives the heading. */
  id: string;
}

/**
 * The headings of the source with the ids the rendered page gives them
 * (GitHub's slugs, numbered in order), skipping front-matter and code.
 */
export function sourceHeadings(text: string): SourceHeading[] {
  const lines = sourceLines(text);
  const tokens = tokenizeSource(text);
  const slug = createSlugger();
  const headings: SourceHeading[] = [];
  tokens.forEach((line, index) => {
    const mark = line[0];
    if (mark?.kind !== 'heading-mark') return;
    const depth = mark.text.trim().length;
    const plain = headingText((lines[index] ?? '').slice(mark.text.length));
    headings.push({ line: index + 1, depth, text: plain, id: slug(plain) });
  });
  return headings;
}
