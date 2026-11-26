export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowSizes {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
}

/** A size alone lets the OS centre the window. */
export type Placement = Rect | { width: number; height: number };

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Where to open the window: the saved bounds moved and shrunk onto the
 * display they mostly cover, or the default size when they no longer touch
 * any display (a monitor was unplugged) or nothing was saved.
 */
export function placeWindow(
  saved: Rect | null,
  workAreas: readonly Rect[],
  sizes: WindowSizes,
): Placement {
  const fallback = (area: Rect | undefined) => ({
    width: area === undefined ? sizes.width : Math.min(sizes.width, area.width),
    height:
      area === undefined ? sizes.height : Math.min(sizes.height, area.height),
  });
  if (saved === null) return fallback(workAreas[0]);
  let best: Rect | undefined;
  let bestOverlap = 0;
  for (const area of workAreas) {
    const value = overlap(saved, area);
    if (value > bestOverlap) {
      best = area;
      bestOverlap = value;
    }
  }
  // A sliver on screen is as good as lost: the title bar may be off it
  if (best === undefined || bestOverlap < 100 * 100) {
    return fallback(workAreas[0]);
  }
  const width = clamp(
    saved.width,
    Math.min(sizes.minWidth, best.width),
    best.width,
  );
  const height = clamp(
    saved.height,
    Math.min(sizes.minHeight, best.height),
    best.height,
  );
  return {
    x: clamp(saved.x, best.x, best.x + best.width - width),
    y: clamp(saved.y, best.y, best.y + best.height - height),
    width,
    height,
  };
}
