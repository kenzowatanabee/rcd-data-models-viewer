import { describe, expect, it } from 'vitest';

import { highlightSql } from './sqlHighlight';

describe('highlightSql', () => {
  it('tells keywords, strings, comments, numbers and quoted names apart', () => {
    const tokens = highlightSql(
      "CASE WHEN `LAST SELL` >= 12 THEN 'SIM' ELSE 'NÃO' END -- span",
    );
    const of = (kind: string) =>
      tokens.filter((token) => token.kind === kind).map((token) => token.text);
    expect(of('keyword')).toEqual(['CASE', 'WHEN', 'THEN', 'ELSE', 'END']);
    expect(of('identifier')).toEqual(['`LAST SELL`']);
    expect(of('number')).toEqual(['12']);
    expect(of('string')).toEqual(["'SIM'", "'NÃO'"]);
    expect(of('comment')).toEqual(['-- span']);
  });

  it('does not colour keywords inside strings or comments', () => {
    const tokens = highlightSql("'select from' /* where */ x");
    expect(tokens.map((token) => token.kind)).toEqual([
      'string',
      'plain',
      'comment',
      'plain',
    ]);
  });

  it('gives back the source exactly, even unterminated', () => {
    for (const source of [
      'DOTS = `A` / `B`   -- per store\nDISTRIBUIÇÃO = 1.5',
      "x = 'open",
      'y = `open',
      '/* open',
      '',
    ]) {
      expect(
        highlightSql(source)
          .map((token) => token.text)
          .join(''),
      ).toBe(source);
    }
  });
});
