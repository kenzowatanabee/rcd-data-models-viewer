import { describe, expect, it } from 'vitest';

import { parseLabel } from './flowLabel';
import {
  startScroll,
  arrivalFrom,
  flowPath,
  shapeBorder,
  shapeSize,
  wrapText,
} from './flowGeometry';

const measure = (text: string) => text.length * 7;

describe('wrapText', () => {
  it('keeps <br> lines and wraps long ones at spaces, keeping styles', () => {
    const parsed = parseLabel('short<br/>a much longer <i>line that wraps</i>');
    if (!parsed.ok) throw new Error(parsed.reason);
    const box = wrapText(parsed.lines, measure, 100, 20);
    expect(box.lines.map((l) => l.map((r) => r.text).join(''))).toEqual([
      'short',
      'a much longer',
      'line that',
      'wraps',
    ]);
    expect(box.lines[2]?.[0]?.italic).toBe(true);
    expect(box.height).toBe(80);
    expect(box.width).toBeLessThanOrEqual(100);
  });

  it('leaves a single word wider than the limit whole', () => {
    const box = wrapText(
      [[{ text: 'RCD_A_VERY_LONG_NAME', italic: false, bold: false }]],
      measure,
      50,
      20,
    );
    expect(box.lines).toHaveLength(1);
  });
});

describe('shapes', () => {
  it('makes room for the text in every shape', () => {
    const text = { width: 100, height: 40 };
    for (const shape of [
      'rect',
      'cylinder',
      'circle',
      'diamond',
      'hexagon',
      'stadium',
    ] as const) {
      const size = shapeSize(shape, text);
      expect(size.width).toBeGreaterThan(text.width);
      expect(size.height).toBeGreaterThan(text.height);
    }
  });

  it('meets a circle on its circumference and a diamond on its edge', () => {
    const circle = { x: 0, y: 0, width: 20, height: 20 };
    const p = shapeBorder('circle', circle, { x: 100, y: 10 });
    expect(p.x).toBeCloseTo(20);
    const diamond = { x: 0, y: 0, width: 40, height: 20 };
    const q = shapeBorder('diamond', diamond, { x: 100, y: 0 });
    // On the upper right edge: x/20 + y/10 = 1 from the centre (20, 10)
    expect((q.x - 20) / 20 + (10 - q.y) / 10).toBeCloseTo(1);
  });
});

describe('flowPath', () => {
  it('leaves and arrives along the flow', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 50 },
    ];
    expect(flowPath(points, 'x')).toBe('M0,0 C50,0 50,50 100,50');
    expect(arrivalFrom(points, 'x')).toEqual({ x: 90, y: 50 });
  });
});

describe('startScroll', () => {
  const picture = { width: 4000, height: 3000 };
  const box = (x: number, y: number) => ({ x, y, width: 200, height: 40 });

  it('does not scroll a picture that fits the frame', () => {
    expect(
      startScroll([box(0, 0)], { width: 500, height: 300 }, 1, 800, 'y'),
    ).toBe(0);
  });

  it('centres a vertical flow on its top nodes', () => {
    const rects = [box(2000, 10), box(2400, 20), box(100, 1500)];
    // top band spans x 2000..2600, centre 2300, frame 800 wide
    expect(startScroll(rects, picture, 1, 800, 'y')).toBe(1900);
    expect(startScroll(rects, picture, 0.5, 800, 'y')).toBe(750);
  });

  it('starts a horizontal flow at its left edge', () => {
    const rects = [box(300, 1200), box(3000, 10)];
    expect(startScroll(rects, picture, 1, 800, 'x')).toBe(284);
  });

  it('never scrolls past either end', () => {
    expect(startScroll([box(3900, 0)], picture, 1, 800, 'y')).toBe(3200);
    expect(startScroll([box(0, 0)], picture, 1, 800, 'y')).toBe(0);
    expect(startScroll([], picture, 1, 800, 'y')).toBe(0);
  });
});
