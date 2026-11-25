/** Breakpoints and column widths of the doc layout. Pure. */
import {
  ASIDE_MAX,
  ASIDE_MIN,
  SIDEBAR_MIN,
  clampSidebarWidth,
} from './settings';

/**
 * Below this the right-hand column becomes a drawer: a 280px sidebar, a
 * 320px column and the content's minimum need about this much.
 */
export const ASIDE_DOCKED_MIN = 1200;
/** Below this the sidebar becomes a drawer too, leaving the doc the width. */
export const SIDEBAR_DOCKED_MIN = 900;
/** The doc column never gets narrower than this while columns are docked. */
export const CONTENT_MIN = 560;

export type Placement = 'docked' | 'drawer';

export interface LayoutMode {
  sidebar: Placement;
  aside: Placement;
}

export function layoutMode(viewport: number): LayoutMode {
  return {
    sidebar: viewport >= SIDEBAR_DOCKED_MIN ? 'docked' : 'drawer',
    aside: viewport >= ASIDE_DOCKED_MIN ? 'docked' : 'drawer',
  };
}

export interface Columns {
  sidebar: number;
  aside: number;
}

/**
 * Widths for the docked columns, so the content keeps at least CONTENT_MIN:
 * the right-hand column gives way first, then the sidebar, neither below
 * its minimum. `null` means that column is not docked.
 */
export function fitColumns(
  viewport: number,
  sidebar: number | null,
  aside: number | null,
): Columns {
  let side = sidebar === null ? 0 : clampSidebarWidth(sidebar, viewport);
  let right =
    aside === null
      ? 0
      : Math.round(
          Math.min(
            ASIDE_MAX,
            Math.max(ASIDE_MIN, Number.isFinite(aside) ? aside : ASIDE_MIN),
          ),
        );
  let over = side + right + CONTENT_MIN - viewport;
  if (over > 0 && aside !== null) {
    const give = Math.min(over, right - ASIDE_MIN);
    right -= give;
    over -= give;
  }
  if (over > 0 && sidebar !== null) {
    side -= Math.min(over, side - SIDEBAR_MIN);
  }
  return { sidebar: side, aside: right };
}
