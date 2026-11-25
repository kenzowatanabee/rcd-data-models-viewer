import { describe, expect, it } from 'vitest';

import {
  CONTENT_MIN,
  fitColumns,
  layoutMode,
  type LayoutMode,
} from './layoutModel';
import { ASIDE_MAX, ASIDE_MIN, SIDEBAR_MIN } from './settings';

describe('layoutMode', () => {
  it('docks both columns on wide windows and drawers them on narrow ones', () => {
    const at = (width: number): LayoutMode => layoutMode(width);
    expect(at(1440)).toEqual({ sidebar: 'docked', aside: 'docked' });
    expect(at(1200)).toEqual({ sidebar: 'docked', aside: 'docked' });
    expect(at(1199)).toEqual({ sidebar: 'docked', aside: 'drawer' });
    expect(at(900)).toEqual({ sidebar: 'docked', aside: 'drawer' });
    expect(at(899)).toEqual({ sidebar: 'drawer', aside: 'drawer' });
  });
});

describe('fitColumns', () => {
  it('keeps stored widths when they fit', () => {
    expect(fitColumns(1440, 280, 320)).toEqual({ sidebar: 280, aside: 320 });
  });

  it('shrinks the right-hand column first, then the sidebar', () => {
    const tight = fitColumns(1200, 400, 400);
    expect(tight.aside).toBe(ASIDE_MIN);
    expect(1200 - tight.sidebar - tight.aside).toBeGreaterThanOrEqual(
      CONTENT_MIN,
    );
    const tighter = fitColumns(1200, 480, 480);
    expect(tighter.aside).toBe(ASIDE_MIN);
    expect(tighter.sidebar).toBeGreaterThanOrEqual(SIDEBAR_MIN);
  });

  it('never goes below the minimums, even if the content must give', () => {
    expect(fitColumns(700, 400, 400)).toEqual({
      sidebar: SIDEBAR_MIN,
      aside: ASIDE_MIN,
    });
  });

  it('ignores columns that are not docked and bad values', () => {
    expect(fitColumns(1000, 300, null)).toEqual({ sidebar: 300, aside: 0 });
    expect(fitColumns(1600, null, 9999)).toEqual({
      sidebar: 0,
      aside: ASIDE_MAX,
    });
    expect(fitColumns(1600, null, NaN).aside).toBe(ASIDE_MIN);
  });
});
