/** Pure helpers for the viewer's persisted UI settings. */

export type ThemePreference = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

/** Keys in localStorage. The theme key is also read by index.html. */
export const STORAGE_KEYS = {
  theme: 'rcd-viewer.theme',
  sidebarWidth: 'rcd-viewer.sidebar-width',
  sidebarCollapsed: 'rcd-viewer.sidebar-collapsed',
  collapsedGroups: 'rcd-viewer.collapsed-groups',
  sidebarFilters: 'rcd-viewer.sidebar-filters',
  graphPanelWidth: 'rcd-viewer.graph-panel-width',
  graphPanelCollapsed: 'rcd-viewer.graph-panel-collapsed',
  docAsideCollapsed: 'rcd-viewer.doc-aside-collapsed',
  docAsideWidth: 'rcd-viewer.doc-aside-width',
  recent: 'rcd-viewer.recent',
  pinned: 'rcd-viewer.pinned',
  groupBy: 'rcd-viewer.group-by',
  density: 'rcd-viewer.density',
  sourceWrap: 'rcd-viewer.source-wrap',
  shortcuts: 'rcd-viewer.shortcuts',
  startup: 'rcd-viewer.startup',
  /** The sidebar's shown/hidden choice on graph and health tabs. */
  sidebarCollapsedGraph: 'rcd-viewer.sidebar-collapsed-graph',
  sidebarCollapsedHealth: 'rcd-viewer.sidebar-collapsed-health',
} as const;

/** Every key the viewer stores starts with this; "Reset all" clears them. */
export const STORAGE_PREFIX = 'rcd-viewer.';

export type Startup = 'restore' | 'home';

export const parseStartup = (raw: string | null): Startup =>
  raw === 'home' ? 'home' : 'restore';

/** A collapsed flag that defaults to hidden (graph and health tabs). */
export const parseHiddenByDefault = (raw: string | null): boolean =>
  raw !== 'false';

/** Per-tab memory (sessionStorage): which docs were left in Markdown view. */
export const SESSION_KEYS = {
  sourceDocs: 'rcd-viewer.source-docs',
} as const;

export function parseThemePreference(raw: string | null): ThemePreference {
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

export function resolveTheme(
  preference: ThemePreference,
  systemDark: boolean,
): Theme {
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 480;
export const SIDEBAR_DEFAULT = 280;

/**
 * Keeps the sidebar between its bounds and, on a narrow window, to at most
 * half of it so the content stays usable.
 */
export function clampSidebarWidth(width: number, viewport: number): number {
  const max = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, viewport / 2));
  if (!Number.isFinite(width)) return Math.min(SIDEBAR_DEFAULT, max);
  return Math.round(Math.min(max, Math.max(SIDEBAR_MIN, width)));
}

export function parseSidebarWidth(raw: string | null): number {
  const value = raw === null || raw.trim() === '' ? NaN : Number(raw);
  if (!Number.isFinite(value)) return SIDEBAR_DEFAULT;
  return Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, value)));
}

export function parseFlag(raw: string | null): boolean {
  return raw === 'true';
}

/** Longest stored group key, and how many are kept; guards odd storage. */
const KEY_MAX = 200;
const KEYS_MAX = 300;

/** A JSON array of strings; anything unreadable means none. */
export function parseStringList(raw: string | null, limit = KEYS_MAX) {
  if (raw === null) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const strings = value.filter(
      (item): item is string =>
        typeof item === 'string' && item !== '' && item.length <= KEY_MAX,
    );
    return [...new Set(strings)].slice(0, limit);
  } catch {
    return [];
  }
}

/** Collapsed sidebar groups, by group key (`datasets`, `layer:source`...). */
export const parseCollapsedGroups = (raw: string | null): Set<string> =>
  new Set(parseStringList(raw));

export const serialiseCollapsedGroups = (groups: ReadonlySet<string>) =>
  JSON.stringify([...groups].sort());

export const PINNED_LIMIT = 30;

/** Pinned doc files, in the order they were pinned. */
export const parsePinned = (raw: string | null) =>
  parseStringList(raw, PINNED_LIMIT);

/** Pins `file` at the end, or unpins it when already there. */
export function togglePinned(pinned: readonly string[], file: string) {
  return pinned.includes(file)
    ? pinned.filter((other) => other !== file)
    : [...pinned, file].slice(-PINNED_LIMIT);
}

export type GroupBy = 'layer' | 'az' | 'family';

export const parseGroupBy = (raw: string | null): GroupBy =>
  raw === 'az' || raw === 'family' ? raw : 'layer';

export type Density = 'comfortable' | 'compact';

export const parseDensity = (raw: string | null): Density =>
  raw === 'compact' ? 'compact' : 'comfortable';

export const ASIDE_MIN = 260;
export const ASIDE_MAX = 480;
export const ASIDE_DEFAULT = 320;

export function parseAsideWidth(raw: string | null): number {
  const value = raw === null || raw.trim() === '' ? NaN : Number(raw);
  if (!Number.isFinite(value)) return ASIDE_DEFAULT;
  return Math.round(Math.min(ASIDE_MAX, Math.max(ASIDE_MIN, value)));
}

/** The last segment of a path, with either kind of slash (Windows too). */
export function folderName(path: string): string {
  const parts = path.split(/[\\/]+/).filter((part) => part !== '');
  return parts[parts.length - 1] ?? path;
}

/** Where focus goes in a list for an arrow, Home or End key; null if none. */
export function nextIndex(
  current: number,
  count: number,
  key: string,
): number | null {
  if (count === 0) return null;
  switch (key) {
    case 'ArrowDown':
      return current < 0 ? 0 : Math.min(current + 1, count - 1);
    case 'ArrowUp':
      return current < 0 ? count - 1 : Math.max(current - 1, 0);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/** Animations are skipped for readers who ask for reduced motion. */
export const motionDuration = (ms: number, reduced: boolean) =>
  reduced ? 0 : ms;
