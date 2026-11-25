/** Pure helpers for the viewer's persisted UI settings. */

export type ThemePreference = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

/** Keys in localStorage. The theme key is also read by index.html. */
export const STORAGE_KEYS = {
  theme: 'rcd-viewer.theme',
  sidebarWidth: 'rcd-viewer.sidebar-width',
  sidebarCollapsed: 'rcd-viewer.sidebar-collapsed',
  collapsedGroups: 'rcd-viewer.collapsed-groups',
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

export const GROUP_IDS = ['datasets', 'pipelines', 'other'] as const;
export type GroupId = (typeof GROUP_IDS)[number];

const isGroupId = (value: unknown): value is GroupId =>
  typeof value === 'string' && (GROUP_IDS as readonly string[]).includes(value);

/** A JSON array of group ids; anything unreadable means none collapsed. */
export function parseCollapsedGroups(raw: string | null): Set<GroupId> {
  if (raw === null) return new Set();
  try {
    const value: unknown = JSON.parse(raw);
    return new Set(Array.isArray(value) ? value.filter(isGroupId) : []);
  } catch {
    return new Set();
  }
}

export function serialiseCollapsedGroups(groups: ReadonlySet<GroupId>) {
  return JSON.stringify(GROUP_IDS.filter((id) => groups.has(id)));
}

/** The last segment of a path, with either kind of slash (Windows too). */
export function folderName(path: string): string {
  const parts = path.split(/[\\/]+/).filter((part) => part !== '');
  return parts[parts.length - 1] ?? path;
}

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** Tag name of the event target, upper case as in the DOM. */
  targetTag: string;
  targetEditable: boolean;
}

/** `/` focuses the filter, unless the reader is typing somewhere. */
export function isFilterShortcut(event: KeyLike): boolean {
  if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }
  if (event.targetEditable) return false;
  return !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.targetTag);
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
