import { describe, expect, it } from 'vitest';

import { splitFrontMatter } from './frontMatter';

describe('splitFrontMatter', () => {
  it('separates the front-matter from the body', () => {
    const doc = splitFrontMatter(
      '---\nname: X\ntype: dataset\n---\n\n# Title\n',
    );
    expect(doc).toEqual({
      data: { name: 'X', type: 'dataset' },
      error: null,
      body: '\n# Title\n',
    });
  });

  it('handles CRLF and a byte order mark', () => {
    const doc = splitFrontMatter('\uFEFF---\r\nname: X\r\n---\r\nBody');
    expect(doc.data).toEqual({ name: 'X' });
    expect(doc.body).toBe('Body');
  });

  it('leaves docs without front-matter alone', () => {
    expect(splitFrontMatter('# Title\n\n---\n')).toEqual({
      data: null,
      error: null,
      body: '# Title\n\n---\n',
    });
  });

  it('still strips front-matter it cannot parse', () => {
    const doc = splitFrontMatter('---\nname: [x\n---\nBody');
    expect(doc.data).toBeNull();
    expect(doc.error).not.toBeNull();
    expect(doc.body).toBe('Body');
  });
});
