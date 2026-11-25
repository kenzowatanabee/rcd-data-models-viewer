import { describe, expect, it } from 'vitest';

import {
  PANEL_DEFAULT,
  PANEL_MAX,
  PANEL_MIN,
  changedOptions,
  clampPanelWidth,
  fitPadding,
  isInView,
  isOverview,
  parsePanelWidth,
  stepNode,
  withPending,
  zoomPercent,
} from './graphChrome';
import { DEFAULT_GRAPH, graphHash } from './route';

describe('view options', () => {
  it('lists the options that differ from the defaults', () => {
    expect(changedOptions(DEFAULT_GRAPH)).toEqual([]);
    expect(
      changedOptions({
        showExternal: false,
        showRedundant: false,
        lookupWires: true,
      }),
    ).toEqual(['showExternal', 'lookupWires']);
  });

  it('shows a pending change only while the address is the one it was made on', () => {
    const route = { ...DEFAULT_GRAPH };
    const base = graphHash(route);
    const pending = { base, change: { showRedundant: true } };
    expect(withPending(route, base, pending).showRedundant).toBe(true);
    // The address moved on (to this or anything else): it wins
    expect(withPending(route, '#/graph?links=all', pending)).toBe(route);
    expect(withPending(route, base, null)).toBe(route);
  });
});

describe('panel width', () => {
  it('stays within bounds and leaves the canvas room', () => {
    expect(clampPanelWidth(100, 1440)).toBe(PANEL_MIN);
    expect(clampPanelWidth(900, 1440)).toBe(PANEL_MAX);
    expect(clampPanelWidth(500, 1000)).toBe(500);
    expect(clampPanelWidth(560, 1000)).toBe(520);
    expect(clampPanelWidth(NaN, 1440)).toBe(PANEL_DEFAULT);
    // Never below the minimum, even when the window is tiny
    expect(clampPanelWidth(400, 600)).toBe(PANEL_MIN);
  });

  it('reads a stored width, defaulting when unreadable', () => {
    expect(parsePanelWidth(null)).toBe(PANEL_DEFAULT);
    expect(parsePanelWidth('abc')).toBe(PANEL_DEFAULT);
    expect(parsePanelWidth('  ')).toBe(PANEL_DEFAULT);
    expect(parsePanelWidth('400.4')).toBe(400);
    expect(parsePanelWidth('9999')).toBe(PANEL_MAX);
  });
});

describe('isInView', () => {
  const size = { width: 800, height: 600 };
  const rect = { x: 100, y: 100, width: 100, height: 40 };

  it('is true only when the whole rectangle is clear of the edges', () => {
    expect(isInView(rect, { x: 0, y: 0, zoom: 1 }, size)).toBe(true);
    expect(isInView(rect, { x: -90, y: 0, zoom: 1 }, size)).toBe(false);
    expect(isInView(rect, { x: 0, y: 0, zoom: 6 }, size)).toBe(false);
    expect(isInView(rect, { x: 0, y: 0, zoom: 0.5 }, size)).toBe(true);
  });
});

describe('zoom', () => {
  it('switches to the overview below the threshold', () => {
    expect(isOverview(0.3)).toBe(true);
    expect(isOverview(0.55)).toBe(false);
    expect(isOverview(1)).toBe(false);
  });

  it('reads as a whole percentage', () => {
    expect(zoomPercent(0.304)).toBe('30%');
    expect(zoomPercent(1)).toBe('100%');
  });

  it('keeps more room at the bottom when the minimap is shown', () => {
    expect(fitPadding(true).bottom).toBeGreaterThan(fitPadding(false).bottom);
  });
});

describe('stepNode', () => {
  // a -> b -> c, with d under b in the same column
  const boxes = new Map([
    ['a', { x: 0, y: 0, width: 100, height: 30 }],
    ['b', { x: 200, y: 0, width: 100, height: 30 }],
    ['c', { x: 400, y: 0, width: 100, height: 30 }],
    ['d', { x: 210, y: 80, width: 100, height: 30 }],
  ]);
  const links = [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
    { from: 'a', to: 'd' },
  ];

  it('follows links right and left', () => {
    expect(stepNode('a', 'ArrowRight', links, boxes)).toBe('b');
    expect(stepNode('b', 'ArrowRight', links, boxes)).toBe('c');
    expect(stepNode('c', 'ArrowLeft', links, boxes)).toBe('b');
    expect(stepNode('c', 'ArrowRight', links, boxes)).toBeNull();
  });

  it('moves up and down within a column', () => {
    expect(stepNode('b', 'ArrowDown', links, boxes)).toBe('d');
    expect(stepNode('d', 'ArrowUp', links, boxes)).toBe('b');
    expect(stepNode('a', 'ArrowDown', links, boxes)).toBeNull();
    expect(stepNode('missing', 'ArrowDown', links, boxes)).toBeNull();
  });
});
