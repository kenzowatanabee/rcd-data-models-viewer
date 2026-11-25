import { describe, expect, it } from 'vitest';

import {
  newScrollKey,
  recalledScroll,
  rememberScroll,
  scrollKeyOf,
  withScrollKey,
} from './scrollMemory';

describe('scroll memory', () => {
  it('reads and writes its key in a history state', () => {
    expect(scrollKeyOf(null)).toBeNull();
    expect(scrollKeyOf({ other: 1 })).toBeNull();
    expect(scrollKeyOf({ docScroll: 3 })).toBeNull();
    const state = withScrollKey({ other: 1 }, 'k1');
    expect(state).toEqual({ other: 1, docScroll: 'k1' });
    expect(scrollKeyOf(state)).toBe('k1');
    expect(withScrollKey(null, 'k2')).toEqual({ docScroll: 'k2' });
  });

  it('remembers positions per key', () => {
    const a = newScrollKey();
    const b = newScrollKey();
    expect(a).not.toBe(b);
    rememberScroll(a, 1200);
    expect(recalledScroll(a)).toBe(1200);
    expect(recalledScroll(b)).toBeUndefined();
  });
});
