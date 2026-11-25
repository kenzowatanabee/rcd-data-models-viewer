import { describe, expect, it } from 'vitest';

import {
  headingText,
  inlineTokens,
  sourceHeadings,
  sourceLines,
  tokenizeSource,
  type Token,
} from './markdownSource';

const DOC = [
  '---',
  'type: dataset',
  'name: RCD_X',
  '# a comment',
  'upstream:',
  '  - RCD_Y',
  '---',
  '',
  '# RCD_X',
  '',
  'See [the glossary](../glossary.md) and `code`.',
  '',
  '## Columns',
  '',
  '| Column | Type |',
  '| :----- | ---- |',
  '| `id` | int |',
  '',
  '```sql',
  '# not a heading',
  'select 1',
  '```',
  '',
  '## Columns',
  '- item',
  '',
].join('\n');

const kinds = (line: Token[] | undefined) =>
  (line ?? []).map((token) => token.kind);

describe('sourceLines', () => {
  it('keeps every line and round-trips the text', () => {
    expect(sourceLines('a\nb\n')).toEqual(['a', 'b']);
    expect(sourceLines('a\nb')).toEqual(['a', 'b']);
    expect(sourceLines('a\r\nb\r\n')).toEqual(['a', 'b']);
    expect(sourceLines('')).toEqual(['']);
    expect(sourceLines('\n\n')).toEqual(['', '']);
    expect(`${sourceLines(DOC).join('\n')}\n`).toBe(DOC);
  });
});

describe('tokenizeSource', () => {
  const lines = tokenizeSource(DOC);

  it('joins back to exactly the source', () => {
    expect(lines.map((line) => line.map((t) => t.text).join(''))).toEqual(
      sourceLines(DOC),
    );
  });

  it('labels front-matter keys, list marks and comments', () => {
    expect(kinds(lines[0])).toEqual(['fm-delim']);
    expect(kinds(lines[1])).toEqual(['fm-key', 'fm-punct', 'text']);
    expect(lines[1]?.[0]?.text).toBe('type');
    expect(kinds(lines[3])).toEqual(['fm-comment']);
    expect(kinds(lines[5])).toEqual(['text', 'fm-punct', 'text']);
    expect(kinds(lines[6])).toEqual(['fm-delim']);
    // A list item holding a colon is a value, not a key
    expect(
      kinds(
        tokenizeSource('---\nsources:\n  - a.json (tag export: x)\n---')[2],
      ),
    ).toEqual(['text', 'fm-punct', 'text']);
  });

  it('labels headings, links, inline code and table pipes', () => {
    expect(kinds(lines[8])).toEqual(['heading-mark', 'heading']);
    expect(kinds(lines[10])).toEqual([
      'text',
      'link-punct',
      'link-text',
      'link-punct',
      'link-url',
      'link-punct',
      'text',
      'inline-code',
      'text',
    ]);
    expect(kinds(lines[14]).filter((k) => k === 'table-pipe')).toHaveLength(3);
    expect(kinds(lines[16])).toContain('inline-code');
  });

  it('treats everything inside a fence as code', () => {
    expect(kinds(lines[18])).toEqual(['fence']);
    expect(kinds(lines[19])).toEqual(['code']);
    expect(kinds(lines[21])).toEqual(['fence']);
    expect(kinds(lines[24])).toEqual(['mark', 'text', 'text']);
  });

  it('closes a fence only with the same character, at least as long', () => {
    const text = '````\n```\nstill code\n````\n# after';
    expect(tokenizeSource(text).map((line) => line[0]?.kind)).toEqual([
      'fence',
      'code',
      'code',
      'fence',
      'heading-mark',
    ]);
  });

  it('leaves hostile HTML as plain slices of text', () => {
    const hostile = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    const tokens = inlineTokens(hostile);
    expect(tokens.map((t) => t.text).join('')).toBe(hostile);
    expect(tokens.every((t) => typeof t.text === 'string')).toBe(true);
    // No front-matter unless it opens the file
    expect(kinds(tokenizeSource('text\n---\nkey: v\n---')[2])).toEqual([
      'text',
    ]);
  });
});

describe('sourceHeadings', () => {
  it('gives the ids the rendered page uses, numbering repeats', () => {
    expect(sourceHeadings(DOC)).toEqual([
      { line: 9, depth: 1, text: 'RCD_X', id: 'rcd_x' },
      { line: 13, depth: 2, text: 'Columns', id: 'columns' },
      { line: 24, depth: 2, text: 'Columns', id: 'columns-1' },
    ]);
  });

  it('reads heading text as the page shows it', () => {
    expect(headingText(' The `name` [link](x.md) **bold** ##')).toBe(
      'The name link bold',
    );
  });
});
