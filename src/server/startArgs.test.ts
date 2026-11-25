import { describe, expect, it } from 'vitest';

import { parseStartArgs } from './startArgs';

describe('parseStartArgs', () => {
  it('takes an optional docs path', () => {
    expect(parseStartArgs([])).toBeNull();
    expect(parseStartArgs(['..\\rcd-data-models'])).toBe('..\\rcd-data-models');
    expect(parseStartArgs(['--', '../docs'])).toBe('../docs');
    expect(parseStartArgs(['--'])).toBeNull();
  });

  it('rejects flags and extra arguments', () => {
    expect(parseStartArgs(['--port', '3000'])).toBeUndefined();
    expect(parseStartArgs(['-h'])).toBeUndefined();
    expect(parseStartArgs(['a', 'b'])).toBeUndefined();
  });
});
