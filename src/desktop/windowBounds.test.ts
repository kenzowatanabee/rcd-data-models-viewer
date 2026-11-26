import { describe, expect, it } from 'vitest';

import { placeWindow } from './windowBounds';

const SIZES = { width: 1440, height: 900, minWidth: 900, minHeight: 600 };
const MAIN = { x: 0, y: 0, width: 1920, height: 1050 };
const RIGHT = { x: 1920, y: 0, width: 1280, height: 760 };

describe('placeWindow', () => {
  it('uses the default size when nothing is saved', () => {
    expect(placeWindow(null, [MAIN], SIZES)).toEqual({
      width: 1440,
      height: 900,
    });
    expect(placeWindow(null, [RIGHT], SIZES)).toEqual({
      width: 1280,
      height: 760,
    });
  });

  it('keeps saved bounds that fit', () => {
    const saved = { x: 100, y: 50, width: 1200, height: 800 };
    expect(placeWindow(saved, [MAIN, RIGHT], SIZES)).toEqual(saved);
  });

  it('pulls a window hanging off a display back onto it', () => {
    expect(
      placeWindow(
        { x: 2800, y: -40, width: 1600, height: 900 },
        [MAIN, RIGHT],
        SIZES,
      ),
    ).toEqual({ x: 1920, y: 0, width: 1280, height: 760 });
  });

  it('falls back when the saved display is gone', () => {
    expect(
      placeWindow({ x: 5000, y: 0, width: 1200, height: 800 }, [MAIN], SIZES),
    ).toEqual({ width: 1440, height: 900 });
  });
});
