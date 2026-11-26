import { describe, expect, it } from 'vitest';

import { recalledScroll, rememberScroll } from './scrollMemory';

describe('scroll memory', () => {
  it('remembers positions per key', () => {
    rememberScroll('a', 1200);
    expect(recalledScroll('a')).toBe(1200);
    expect(recalledScroll('b')).toBeUndefined();
  });
});
