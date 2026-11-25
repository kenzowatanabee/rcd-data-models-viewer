import { describe, expect, it } from 'vitest';

import { createSlugger, githubSlug } from './slug';

describe('githubSlug', () => {
  it('matches the anchors GitHub gives headings', () => {
    expect(githubSlug('Q22: RCD_SORT_REC is long, not wide')).toBe(
      'q22-rcd_sort_rec-is-long-not-wide',
    );
    expect(githubSlug('`RCD_SORT_REC` (flow output)')).toBe(
      'rcd_sort_rec-flow-output',
    );
    expect(githubSlug('Distribuição × canal')).toBe('distribuição--canal');
  });
});

describe('createSlugger', () => {
  it('numbers repeated headings', () => {
    const slug = createSlugger();
    expect(['Notes', 'Notes', 'Notes', 'Notes-1'].map(slug)).toEqual([
      'notes',
      'notes-1',
      'notes-2',
      'notes-1-1',
    ]);
  });
});
