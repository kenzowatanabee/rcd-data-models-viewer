import { describe, expect, it } from 'vitest';

import {
  MAX_SCALE,
  MIN_SCALE,
  centred,
  fitView,
  startsFitted,
  wheelFactor,
  zoomAt,
} from './panZoom';

describe('fitView', () => {
  it('shrinks a large diagram to fit and centres it', () => {
    const view = fitView(
      { width: 4000, height: 1000 },
      { width: 1048, height: 800 },
    );
    expect(view.scale).toBeCloseTo(0.25);
    expect(view.x).toBeCloseTo(24);
    expect(view.y).toBeCloseTo((800 - 250) / 2);
  });

  it('never enlarges a small diagram', () => {
    expect(
      fitView({ width: 200, height: 100 }, { width: 1000, height: 800 }).scale,
    ).toBe(1);
  });

  it('copes with an empty diagram', () => {
    expect(fitView({ width: 0, height: 0 }, { width: 10, height: 10 })).toEqual(
      { x: 0, y: 0, scale: 1 },
    );
  });
});

describe('zoomAt', () => {
  it('keeps the point under the cursor in place', () => {
    const view = { x: 100, y: 50, scale: 1 };
    const at = { x: 300, y: 250 };
    const zoomed = zoomAt(view, 2, at);
    expect(zoomed.scale).toBe(2);
    // Content point under the cursor before and after
    expect((at.x - view.x) / view.scale).toBeCloseTo(
      (at.x - zoomed.x) / zoomed.scale,
    );
    expect((at.y - view.y) / view.scale).toBeCloseTo(
      (at.y - zoomed.y) / zoomed.scale,
    );
  });

  it('clamps the scale', () => {
    expect(zoomAt({ x: 0, y: 0, scale: 3 }, 10, { x: 0, y: 0 }).scale).toBe(
      MAX_SCALE,
    );
    expect(zoomAt({ x: 0, y: 0, scale: 0.2 }, 0.01, { x: 0, y: 0 }).scale).toBe(
      MIN_SCALE,
    );
  });
});

describe('centred and wheelFactor', () => {
  it('centres at a given scale', () => {
    expect(
      centred({ width: 100, height: 50 }, { width: 300, height: 150 }, 1),
    ).toEqual({ x: 100, y: 50, scale: 1 });
  });

  it('zooms in for wheel up, out for wheel down, bounded per event', () => {
    expect(wheelFactor(-100)).toBeGreaterThan(1);
    expect(wheelFactor(100)).toBeLessThan(1);
    expect(wheelFactor(10000)).toBe(wheelFactor(100));
  });
});

describe('startsFitted', () => {
  it('fits diagrams only a little wider than the column', () => {
    expect(startsFitted(1000, 800)).toBe(true);
    expect(startsFitted(800, 800)).toBe(false);
    expect(startsFitted(600, 800)).toBe(false);
    expect(startsFitted(4000, 800)).toBe(false);
    expect(startsFitted(1000, 0)).toBe(false);
  });
});
