import { describe, expect, it } from 'vitest';

import { normaliseName } from '../indexer/names';
import {
  field,
  foldWithMap,
  highlightParts,
  queryTokens,
  rankCandidates,
  type Candidate,
} from './quickMatch';

const item = (
  id: string,
  name: string,
  aliases: string[] = [],
  path: string[] = [],
): Candidate => ({
  id,
  label: name,
  fields: [
    field(name, 0),
    ...aliases.map((alias) => field(alias, 1)),
    ...path.map((text) => field(text, 2)),
  ],
});

const ids = (query: string, items: Candidate[]) =>
  rankCandidates(query, items).map((ranked) => ranked.item.id);

describe('foldWithMap', () => {
  it('folds like normaliseName', () => {
    for (const text of [
      'RCD_DISTRIBUIÇÃO',
      'Retailer POS  datasets',
      'a-b_c d',
    ]) {
      expect(foldWithMap(text).text).toBe(normaliseName(text));
    }
  });

  it('maps folded characters back to the original', () => {
    const folded = foldWithMap('Ção x');
    expect(folded.text).toBe('cao_x');
    expect(folded.map).toEqual([0, 1, 2, 3, 4]);
    expect(folded.starts).toEqual([0, 4]);
  });
});

describe('queryTokens', () => {
  it('splits on any separator', () => {
    expect(queryTokens(' Sort-rec  nacional/x ')).toEqual([
      'sort',
      'rec',
      'nacional',
      'x',
    ]);
  });
});

describe('rankCandidates', () => {
  const items = [
    item('a', 'RCD_SORT_REC_NACIONAL'),
    item('b', 'RCD_SORT_REC'),
    item('c', 'RCD SORTIMENTO RECOMENDADO'),
    item('d', 'RCD_TAB_MKT_CUSTOMER_COMPLETO'),
    item('e', 'RCD_TAB_MKT_CUSTOMER_RESUMO'),
    item('f', 'RCD_HIERARQUIA_DISTRIBUIÇÃO'),
    item('g', 'RCD_DISTRIBUIÇÃO_NIQ_MASTER'),
    item('h', 'PRODUCT_DIMENSION', ['RCD_MASTER_PRODUCT']),
    item('i', 'Market notes', [], ['docs/rcd-master.md']),
  ];

  it('needs every token, in any order', () => {
    expect(ids('sort rec', items).slice(0, 2)).toEqual(['b', 'a']);
    expect(ids('rec sort', items)[0]).toBe('b');
    expect(ids('mkt cust compl', items)).toEqual(['d']);
    expect(ids('compl mkt', items)).toEqual(['d']);
  });

  it('ignores case, accents and separators', () => {
    expect(ids('distribuicao', items).slice(0, 2)).toEqual(['g', 'f']);
    expect(ids('Hierarquia-Distribuição', items)[0]).toBe('f');
  });

  it('ranks exact and prefix over substring over subsequence', () => {
    const list = [
      item('sub', 'XPOSY'),
      item('seq', 'P_O_S'),
      item('pre', 'POSITION'),
      item('word', 'RCD_POS'),
    ];
    expect(ids('pos', list)).toEqual(['word', 'pre', 'sub', 'seq']);
  });

  it('ranks the name over aliases over paths', () => {
    const list = [
      item('path', 'Notes', [], ['docs/master.md']),
      item('alias', 'PRODUCT_DIMENSION', ['RCD_MASTER_PRODUCT']),
      item('name', 'RCD_MASTER_FLOW_1'),
    ];
    expect(ids('master', list)).toEqual(['name', 'alias', 'path']);
  });

  it('puts an exact whole name first, then shorter names', () => {
    const list = [
      item('long', 'RCD_POS_BASE (dataflow)'),
      item('short', 'RCD_POS_BASE'),
    ];
    expect(ids('pos base', list)).toEqual(['short', 'long']);
    expect(ids('rcd pos base', list)[0]).toBe('short');
    const withDoc = [...list, item('doc', 'pos-base-dataflow.md')];
    expect(ids('pos base', withDoc)[0]).toBe('short');
  });

  it('takes subsequences of word starts and runs only', () => {
    const list = [
      item('acr', 'RCD_SORT_REC'),
      item('far', 'STORE_CLASSIFICATION'),
    ];
    expect(ids('rsr', list)).toEqual(['acr']);
    expect(ids('sortrec', list)).toEqual(['acr']);
    expect(ids('sort', [list[1] as Candidate])).toEqual([]);
  });

  it('is stable for ties', () => {
    const list = [item('2', 'B x'), item('1', 'A x'), item('3', 'A x')];
    expect(ids('x', list)).toEqual(['1', '3', '2']);
    expect(ids('x', [...list].reverse())).toEqual(['1', '3', '2']);
  });

  it('reports the matched characters of the field that matched', () => {
    const [first] = rankCandidates('master', items.slice(7, 8));
    expect(first?.match.highlights).toEqual([
      { field: 1, at: [4, 5, 6, 7, 8, 9] },
    ]);
  });

  it('matches nothing for an empty query', () => {
    expect(ids('  ', items)).toEqual([]);
  });
});

describe('highlightParts', () => {
  it('splits text into runs', () => {
    expect(highlightParts('abcd', [1, 2])).toEqual([
      { text: 'a', hit: false },
      { text: 'bc', hit: true },
      { text: 'd', hit: false },
    ]);
  });
});
