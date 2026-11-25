import { describe, expect, it } from 'vitest';

import { parseArgs } from './args';

describe('parseArgs', () => {
  it('takes the repo path and defaults the output file', () => {
    expect(parseArgs(['../docs'])).toEqual({
      repo: '../docs',
      out: 'graph.json',
    });
  });

  it('takes --out before or after the repo path', () => {
    expect(parseArgs(['../docs', '--out', 'g.json'])).toEqual({
      repo: '../docs',
      out: 'g.json',
    });
    expect(parseArgs(['--out', 'g.json', '../docs'])).toEqual({
      repo: '../docs',
      out: 'g.json',
    });
  });

  it('rejects a missing repo, a missing value, extras and unknown flags', () => {
    expect(parseArgs([])).toBeNull();
    expect(parseArgs(['--out', 'g.json'])).toBeNull();
    expect(parseArgs(['../docs', '--out'])).toBeNull();
    expect(parseArgs(['a', 'b'])).toBeNull();
    expect(parseArgs(['../docs', '--strict'])).toBeNull();
  });
});
