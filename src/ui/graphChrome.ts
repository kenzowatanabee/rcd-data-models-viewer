/** Pure helpers for the graph page's toolbar, panel and canvas controls. */

import type { Rect } from './graphLayout';
import { DEFAULT_GRAPH, type GraphRoute } from './route';

export type ViewOptionKey = 'showExternal' | 'showRedundant' | 'lookupWires';

export interface ViewOption {
  key: ViewOptionKey;
  label: string;
  hint: string;
}

/** The display options in the "View options" menu, in display order. */
export const VIEW_OPTIONS: readonly ViewOption[] = [
  {
    key: 'showExternal',
    label: 'Undocumented names',
    hint: 'Names that docs mention but no doc describes, drawn dashed.',
  },
  {
    key: 'showRedundant',
    label: 'Repeated direct links',
    hint: 'Dataset to dataset links that a pipeline between them already shows.',
  },
  {
    key: 'lookupWires',
    label: 'Lines for shared lookups',
    hint: 'A line to every reader instead of a "lookups" tag on each one.',
  },
];

/** The options that differ from the defaults. */
export function changedOptions(
  route: Pick<GraphRoute, ViewOptionKey>,
): ViewOptionKey[] {
  return VIEW_OPTIONS.map((option) => option.key).filter(
    (key) => route[key] !== DEFAULT_GRAPH[key],
  );
}

/**
 * A change a control asked for, made against the address `base`. Until the
 * address catches up the controls show it, so a checkbox never flicks back.
 */
export interface Pending {
  base: string;
  change: Partial<GraphRoute>;
}

export function withPending(
  route: GraphRoute,
  hash: string,
  pending: Pending | null,
): GraphRoute {
  return pending !== null && pending.base === hash
    ? { ...route, ...pending.change }
    : route;
}

export const PANEL_MIN = 260;
export const PANEL_MAX = 560;
export const PANEL_DEFAULT = 320;
/** The canvas keeps at least this much of the window. */
const CANVAS_MIN = 480;

export function clampPanelWidth(width: number, viewport: number): number {
  const max = Math.max(PANEL_MIN, Math.min(PANEL_MAX, viewport - CANVAS_MIN));
  if (!Number.isFinite(width)) return Math.min(PANEL_DEFAULT, max);
  return Math.round(Math.min(max, Math.max(PANEL_MIN, width)));
}

export function parsePanelWidth(raw: string | null): number {
  const value = raw === null || raw.trim() === '' ? NaN : Number(raw);
  if (!Number.isFinite(value)) return PANEL_DEFAULT;
  return Math.round(Math.min(PANEL_MAX, Math.max(PANEL_MIN, value)));
}

export interface ViewportLike {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Whether `rect` (in layout coordinates) is wholly on screen, `margin`
 * pixels clear of the edges. A selection is centred only when it is not,
 * so picking something already visible never moves the view.
 */
export function isInView(
  rect: Rect,
  viewport: ViewportLike,
  size: { width: number; height: number },
  margin = 24,
): boolean {
  const left = rect.x * viewport.zoom + viewport.x;
  const top = rect.y * viewport.zoom + viewport.y;
  const right = left + rect.width * viewport.zoom;
  const bottom = top + rect.height * viewport.zoom;
  return (
    left >= margin &&
    top >= margin &&
    right <= size.width - margin &&
    bottom <= size.height - margin
  );
}

/**
 * Below this zoom the 12px labels are under 7px on screen, unreadable;
 * nodes are then drawn as coloured blocks and the band titles grow.
 */
export const OVERVIEW_ZOOM = 0.55;
export const isOverview = (zoom: number) => zoom < OVERVIEW_ZOOM;

export const zoomPercent = (zoom: number) => `${Math.round(zoom * 100)}%`;

/** The minimap only earns its room on a wide canvas. */
export const MINIMAP_MIN_WIDTH = 900;

/**
 * Room kept clear when fitting, in screen pixels: the zoom controls sit
 * at the bottom left and the minimap, when shown, at the bottom right.
 */
export function fitPadding(minimap: boolean) {
  return { top: 24, right: 24, left: 24, bottom: minimap ? 148 : 64 };
}

type Step = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';
export const isStep = (key: string): key is Step =>
  ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key);

/**
 * The node an arrow key moves to from `id`: right and left follow the
 * links downstream and upstream, up and down go to the nearest node above
 * or below in the same column. Null when there is none.
 */
export function stepNode(
  id: string,
  key: Step,
  links: readonly { from: string; to: string }[],
  boxes: ReadonlyMap<string, Rect>,
): string | null {
  const here = boxes.get(id);
  if (here === undefined) return null;
  const mid = (r: Rect) => r.y + r.height / 2;
  let candidates: string[];
  if (key === 'ArrowRight' || key === 'ArrowLeft') {
    const right = key === 'ArrowRight';
    candidates = links
      .filter((l) => (right ? l.from : l.to) === id)
      .map((l) => (right ? l.to : l.from))
      .filter((other) => other !== id);
  } else {
    const up = key === 'ArrowUp';
    candidates = [...boxes]
      .filter(
        ([other, r]) =>
          other !== id &&
          r.x < here.x + here.width &&
          r.x + r.width > here.x &&
          (up ? mid(r) < mid(here) : mid(r) > mid(here)),
      )
      .map(([other]) => other);
  }
  const distance = (other: string) => {
    const r = boxes.get(other);
    if (r === undefined) return Infinity;
    return Math.abs(mid(r) - mid(here)) + Math.abs(r.x - here.x) / 4;
  };
  return (
    [...new Set(candidates)].sort(
      (a, b) => distance(a) - distance(b) || (a < b ? -1 : 1),
    )[0] ?? null
  );
}
