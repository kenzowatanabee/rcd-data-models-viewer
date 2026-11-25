import { describe, expect, it } from 'vitest';

import {
  clippedEdges,
  countMatches,
  numericColumns,
  rowMatches,
} from './tableModel';

describe('rowMatches', () => {
  it('matches like the sidebar filter', () => {
    expect(rowMatches('', 'anything')).toBe(true);
    expect(rowMatches('  ', 'anything')).toBe(true);
    expect(rowMatches('sort rec', 'SORT_REC_ATUAL text')).toBe(true);
    expect(rowMatches('lancamento', 'LANÇAMENTO Launch flag')).toBe(true);
    expect(rowMatches('ean', 'STATUS MANTIDO')).toBe(false);
  });

  it('counts matching rows', () => {
    expect(countMatches('cat', ['CATEGORY', 'SUB_CATEGORY', 'EAN'])).toBe(2);
    expect(countMatches('', ['a', 'b'])).toBe(2);
  });
});

describe('numericColumns', () => {
  it('flags columns of numbers only', () => {
    expect(
      numericColumns([
        ['RESUMO', '91,585,965', 'text', '1'],
        ['CLASSIFICATION', '1 174 156', '—', 'x'],
        ['OTHER', '', '', '2'],
      ]),
    ).toEqual([false, true, false, false]);
  });

  it('accepts decimals, signs and percentages, not dates or codes', () => {
    expect(numericColumns([['-3.5'], ['42 %'], ['0,25']])).toEqual([true]);
    expect(numericColumns([['2026-11-23'], ['2026-11-24']])).toEqual([false]);
    expect(numericColumns([['25 - Q3'], ['1']])).toEqual([false]);
  });

  it('needs at least two numbers', () => {
    expect(numericColumns([['1'], ['']])).toEqual([false]);
    expect(numericColumns([])).toEqual([]);
  });
});

describe('clippedEdges', () => {
  it('reports which side hides content', () => {
    expect(clippedEdges(0, 500, 500)).toEqual({ left: false, right: false });
    expect(clippedEdges(0, 500, 900)).toEqual({ left: false, right: true });
    expect(clippedEdges(200, 500, 900)).toEqual({ left: true, right: true });
    expect(clippedEdges(400, 500, 900)).toEqual({ left: true, right: false });
    // Sub-pixel rounding is not clipping
    expect(clippedEdges(0, 500, 500.6)).toEqual({ left: false, right: false });
  });
});
