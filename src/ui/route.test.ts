import { describe, expect, it } from 'vitest';

import { docHash, parseHash } from './route';

describe('parseHash', () => {
  it('reads a doc and an optional anchor', () => {
    expect(parseHash('#/doc/docs/datasets/x.md')).toEqual({
      view: 'doc',
      file: 'docs/datasets/x.md',
      anchor: null,
    });
    expect(parseHash('#/doc/docs/open-questions.md#q22-a_b')).toEqual({
      view: 'doc',
      file: 'docs/open-questions.md',
      anchor: 'q22-a_b',
    });
  });

  it('falls back to the landing view', () => {
    expect(parseHash('')).toEqual({ view: 'home' });
    expect(parseHash('#/')).toEqual({ view: 'home' });
    expect(parseHash('#/doc/')).toEqual({ view: 'home' });
    expect(parseHash('#something')).toEqual({ view: 'home' });
  });

  it('round-trips through docHash', () => {
    for (const [file, anchor] of [
      ['docs/a b.md', null],
      ['docs/ção.md', 'seção-1'],
      ['guides/x%y.md', 'a#b'],
    ] as const) {
      expect(parseHash(docHash(file, anchor))).toEqual({
        view: 'doc',
        file,
        anchor,
      });
    }
    expect(docHash('docs/lineage.md')).toBe('#/doc/docs/lineage.md');
  });
});
