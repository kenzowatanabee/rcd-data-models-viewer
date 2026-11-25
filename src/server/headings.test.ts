import { describe, expect, it } from 'vitest';

import { extractHeadings, headingText } from './headings';

describe('headingText', () => {
  it('reads headings as the page shows them', () => {
    expect(headingText('Q22. `RCD_SORT_REC` is long, not wide')).toBe(
      'Q22. RCD_SORT_REC is long, not wide',
    );
    expect(headingText('*(dropped)*')).toBe('(dropped)');
    expect(headingText('See [the flow](x.md) _now_')).toBe('See the flow now');
    expect(headingText('A <i>b</i> &amp; c')).toBe('A b & c');
  });
});

describe('extractHeadings', () => {
  it('lists h2 to h4 with GitHub anchors, skipping the title and code', () => {
    const text = [
      '---',
      'name: X',
      '---',
      '# Overview',
      '',
      '## Overview',
      '```sql',
      '## not a heading',
      '```',
      '### Q1. `A_B` vs C ###',
      '#### Deep',
      '##### Too deep',
      '## Overview',
    ].join('\n');
    expect(extractHeadings(text)).toEqual([
      { id: 'overview-1', text: 'Overview', depth: 2 },
      { id: 'q1-a_b-vs-c', text: 'Q1. A_B vs C', depth: 3 },
      { id: 'deep', text: 'Deep', depth: 4 },
      { id: 'overview-2', text: 'Overview', depth: 2 },
    ]);
  });

  it('handles CRLF and tilde fences', () => {
    expect(
      extractHeadings('## A\r\n~~~\r\n## B\r\n~~~\r\n## C\r\n').map(
        (h) => h.id,
      ),
    ).toEqual(['a', 'c']);
  });
});
