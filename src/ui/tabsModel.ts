/**
 * Tabs, pure: each tab holds its own history of addresses (hash routes),
 * and the strip's order, pins, the active tab and a stack of closed tabs.
 * The address bar always shows the active tab's current address.
 */
import { parseHash } from './route';

export type TabKind = 'home' | 'doc' | 'graph' | 'health';

export interface Entry {
  hash: string;
  /** Names this visit, for the scroll position remembered for it. */
  key: string;
}

export interface Tab {
  id: string;
  entries: Entry[];
  /** The current entry. */
  index: number;
  pinned: boolean;
  /** When it was last active, for the most-recently-used order. */
  used: number;
  /** The tab it was opened from, so a run of new tabs keeps its order. */
  opener?: string;
}

export interface ClosedTab {
  tab: Tab;
  /** Where it stood in the strip. */
  position: number;
}

export interface TabsState {
  tabs: Tab[];
  active: string;
  closed: ClosedTab[];
  /** Counter for ids, keys and `used`; kept here so the reducer is pure. */
  seq: number;
}

export const HOME_HASH = '#/';
/** Back/forward entries kept per tab. */
export const HISTORY_MAX = 50;
/** Closed tabs that can be reopened. */
export const CLOSED_MAX = 20;
export const TABS_MAX = 60;

export const kindOf = (hash: string): TabKind => parseHash(hash).view;

/** The address with an empty hash read as the start page. */
export const normaliseHash = (hash: string) =>
  hash === '' || hash === '#' ? HOME_HASH : hash;

export const current = (tab: Tab): Entry =>
  tab.entries[tab.index] ?? tab.entries[0] ?? { hash: HOME_HASH, key: 'none' };

export const currentHash = (tab: Tab) => current(tab).hash;

export const activeTab = (state: TabsState): Tab =>
  state.tabs.find((tab) => tab.id === state.active) ?? state.tabs[0]!;

function newTab(state: TabsState, hash: string, pinned = false) {
  const seq = state.seq + 1;
  const tab: Tab = {
    id: `t${seq}`,
    entries: [{ hash, key: `e${seq}` }],
    index: 0,
    pinned,
    used: seq,
  };
  return { tab, seq };
}

export function emptyState(hash = HOME_HASH): TabsState {
  const { tab, seq } = newTab(
    { tabs: [], active: '', closed: [], seq: 0 },
    hash,
  );
  return { tabs: [tab], active: tab.id, closed: [], seq };
}

/** Pinned tabs first, in their order, then the rest. */
const ordered = (tabs: Tab[]) => [
  ...tabs.filter((tab) => tab.pinned),
  ...tabs.filter((tab) => !tab.pinned),
];

function activate(state: TabsState, id: string): TabsState {
  if (!state.tabs.some((tab) => tab.id === id)) return state;
  const seq = state.seq + 1;
  return {
    ...state,
    seq,
    active: id,
    tabs: state.tabs.map((tab) =>
      tab.id === id ? { ...tab, used: seq } : tab,
    ),
  };
}

function updateTab(state: TabsState, id: string, change: (tab: Tab) => Tab) {
  return {
    ...state,
    tabs: state.tabs.map((tab) => (tab.id === id ? change(tab) : tab)),
  };
}

/** A new visit in the tab: forward history is dropped, as in a browser. */
function push(state: TabsState, id: string, hash: string): TabsState {
  const tab = state.tabs.find((other) => other.id === id);
  if (tab === undefined || currentHash(tab) === hash) return state;
  const seq = state.seq + 1;
  return {
    ...updateTab(state, id, (tab) => {
      if (currentHash(tab) === hash) return tab;
      const kept = tab.entries.slice(0, tab.index + 1);
      const entries = [...kept, { hash, key: `e${seq}` }].slice(-HISTORY_MAX);
      return { ...tab, entries, index: entries.length - 1 };
    }),
    seq,
  };
}

/** The same visit with another address (a view switch, a selection). */
function replace(state: TabsState, id: string, hash: string): TabsState {
  const tab = state.tabs.find((other) => other.id === id);
  if (tab === undefined || currentHash(tab) === hash) return state;
  const seq = state.seq + 1;
  return {
    ...updateTab(state, id, (tab) => {
      if (currentHash(tab) === hash) return tab;
      const entries = [...tab.entries];
      entries[tab.index] = { hash, key: `e${seq}` };
      return { ...tab, entries };
    }),
    seq,
  };
}

/** Closes tabs; the last one closed leaves a single Home tab. */
function closeTabs(state: TabsState, ids: ReadonlySet<string>): TabsState {
  if (ids.size === 0) return state;
  const closing = state.tabs
    .map((tab, position) => ({ tab, position }))
    .filter(({ tab }) => ids.has(tab.id));
  const closed = [...state.closed, ...closing].slice(-CLOSED_MAX);
  const left = state.tabs.filter((tab) => !ids.has(tab.id));
  if (left.length === 0) {
    const { tab, seq } = newTab(state, HOME_HASH);
    return { tabs: [tab], active: tab.id, closed, seq };
  }
  let active = state.active;
  if (ids.has(active)) {
    // The neighbour on the right takes over, else the one on the left
    const at = state.tabs.findIndex((tab) => tab.id === active);
    const right = state.tabs.slice(at + 1).find((tab) => !ids.has(tab.id));
    const leftOf = state.tabs
      .slice(0, at)
      .reverse()
      .find((tab) => !ids.has(tab.id));
    active = (right ?? leftOf ?? left[0]!).id;
  }
  return activate({ ...state, tabs: left, closed, active }, active);
}

export type TabsAction =
  /** The active tab goes to `hash`; `replace` keeps the same entry. */
  | { type: 'navigate'; hash: string; replace?: boolean }
  | { type: 'open'; hash: string; background?: boolean }
  | { type: 'activate'; id: string }
  | { type: 'activate-index'; index: number }
  | { type: 'cycle'; by: 1 | -1 }
  | { type: 'close'; id: string }
  | { type: 'close-others'; id: string }
  | { type: 'close-right'; id: string }
  | { type: 'pin'; id: string; pinned: boolean }
  | { type: 'move'; id: string; to: number }
  | { type: 'back'; id?: string }
  | { type: 'forward'; id?: string }
  | { type: 'reopen' }
  /** Activates the most recently used tab of a kind, or opens one. */
  | { type: 'show-kind'; kinds: readonly TabKind[]; hash: string }
  | { type: 'reset'; state: TabsState };

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case 'navigate': {
      const hash = normaliseHash(action.hash);
      return action.replace
        ? replace(state, state.active, hash)
        : push(state, state.active, hash);
    }
    case 'open': {
      if (state.tabs.length >= TABS_MAX) {
        return action.background
          ? state
          : push(state, state.active, action.hash);
      }
      const created = newTab(state, normaliseHash(action.hash));
      const { seq } = created;
      const tab = { ...created.tab, opener: state.active };
      // After the active tab and the tabs already opened from it
      let at = state.tabs.findIndex((other) => other.id === state.active);
      while (state.tabs[at + 1]?.opener === state.active) at += 1;
      const tabs = ordered([
        ...state.tabs.slice(0, at + 1),
        // A background tab is not used yet: it is the first to be unmounted
        action.background ? { ...tab, used: 0 } : tab,
        ...state.tabs.slice(at + 1),
      ]);
      const next = { ...state, tabs, seq };
      return action.background ? next : activate(next, tab.id);
    }
    case 'activate':
      return state.active === action.id ? state : activate(state, action.id);
    case 'activate-index': {
      // 9 is the last tab, as in browsers
      const tab =
        action.index >= 9
          ? state.tabs[state.tabs.length - 1]
          : state.tabs[action.index - 1];
      return tab === undefined ? state : activate(state, tab.id);
    }
    case 'cycle': {
      const at = state.tabs.findIndex((tab) => tab.id === state.active);
      const count = state.tabs.length;
      const tab = state.tabs[(at + action.by + count) % count];
      return tab === undefined ? state : activate(state, tab.id);
    }
    case 'close':
      return closeTabs(state, new Set([action.id]));
    case 'close-others':
      return activate(
        closeTabs(
          state,
          new Set(
            state.tabs
              .filter((tab) => tab.id !== action.id && !tab.pinned)
              .map((tab) => tab.id),
          ),
        ),
        action.id,
      );
    case 'close-right': {
      const at = state.tabs.findIndex((tab) => tab.id === action.id);
      if (at === -1) return state;
      const ids = state.tabs
        .slice(at + 1)
        .filter((tab) => !tab.pinned)
        .map((tab) => tab.id);
      const closed = closeTabs(state, new Set(ids));
      return ids.includes(state.active) ? activate(closed, action.id) : closed;
    }
    case 'pin': {
      const tabs = state.tabs.map((tab) =>
        tab.id === action.id ? { ...tab, pinned: action.pinned } : tab,
      );
      // A newly pinned tab goes to the end of the pinned ones, an unpinned
      // one to the start of the rest
      const moved = tabs.find((tab) => tab.id === action.id);
      if (moved === undefined) return state;
      const others = tabs.filter((tab) => tab.id !== action.id);
      const pinned = others.filter((tab) => tab.pinned);
      const rest = others.filter((tab) => !tab.pinned);
      return { ...state, tabs: [...pinned, moved, ...rest] };
    }
    case 'move': {
      const from = state.tabs.findIndex((tab) => tab.id === action.id);
      const tab = state.tabs[from];
      if (tab === undefined) return state;
      const pinnedCount = state.tabs.filter((other) => other.pinned).length;
      // Pinned tabs stay among the pinned ones, the others after them
      const lo = tab.pinned ? 0 : pinnedCount;
      const hi = tab.pinned ? pinnedCount - 1 : state.tabs.length - 1;
      const to = Math.max(lo, Math.min(hi, action.to));
      if (to === from) return state;
      const tabs = [...state.tabs];
      tabs.splice(from, 1);
      tabs.splice(to, 0, tab);
      return { ...state, tabs };
    }
    case 'back':
    case 'forward': {
      const by = action.type === 'back' ? -1 : 1;
      return updateTab(state, action.id ?? state.active, (tab) => {
        const index = tab.index + by;
        return index < 0 || index >= tab.entries.length
          ? tab
          : { ...tab, index };
      });
    }
    case 'reopen': {
      const last = state.closed[state.closed.length - 1];
      if (last === undefined) return state;
      const closed = state.closed.slice(0, -1);
      // A lone, untouched Home tab is what closing the last tab left: replace it
      const only = state.tabs.length === 1 ? state.tabs[0] : undefined;
      const blank =
        only !== undefined &&
        only.entries.length === 1 &&
        currentHash(only) === HOME_HASH;
      const base = blank ? [] : state.tabs;
      const tabs = [...base];
      tabs.splice(Math.min(last.position, tabs.length), 0, last.tab);
      return activate({ ...state, tabs: ordered(tabs), closed }, last.tab.id);
    }
    case 'show-kind': {
      const active = activeTab(state);
      if (action.kinds.includes(kindOf(currentHash(active)))) return state;
      const recent = [...state.tabs]
        .filter((tab) => action.kinds.includes(kindOf(currentHash(tab))))
        .sort((a, b) => b.used - a.used)[0];
      if (recent !== undefined) return activate(state, recent.id);
      return tabsReducer(state, { type: 'open', hash: action.hash });
    }
    case 'reset':
      return action.state;
  }
}

export const canGoBack = (tab: Tab) => tab.index > 0;
export const canGoForward = (tab: Tab) => tab.index < tab.entries.length - 1;

/** The tabs to keep mounted: the active one and the most recently used. */
export function mountedIds(state: TabsState, limit: number): Set<string> {
  const byUse = [...state.tabs].sort((a, b) => b.used - a.used);
  const ids = new Set(
    byUse
      .filter((tab) => tab.used > 0)
      .slice(0, limit)
      .map((tab) => tab.id),
  );
  ids.add(state.active);
  return ids;
}

// Persistence, one record per docs folder

export interface StoredTab {
  hash: string;
  pinned: boolean;
  /** Scroll position of a doc tab's current entry. */
  scroll: number | null;
}

export interface StoredTabs {
  tabs: StoredTab[];
  active: number;
}

const HASH_MAX = 2000;

export const tabsStorageKey = (folder: string) => `rcd-viewer.tabs:${folder}`;

export function serialiseTabs(
  state: TabsState,
  scrollOf: (key: string) => number | undefined,
): string {
  const stored: StoredTabs = {
    tabs: state.tabs.map((tab) => ({
      hash: currentHash(tab),
      pinned: tab.pinned,
      scroll: scrollOf(current(tab).key) ?? null,
    })),
    active: Math.max(
      0,
      state.tabs.findIndex((tab) => tab.id === state.active),
    ),
  };
  return JSON.stringify({ v: 1, ...stored });
}

/** Stored tabs, or null when there are none or they cannot be read. */
export function parseStoredTabs(raw: string | null): StoredTabs | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (value === null || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.v !== 1 || !Array.isArray(record.tabs)) return null;
  const tabs: StoredTab[] = [];
  for (const item of record.tabs.slice(0, TABS_MAX)) {
    if (item === null || typeof item !== 'object') continue;
    const { hash, pinned, scroll } = item as Record<string, unknown>;
    if (typeof hash !== 'string' || hash.length > HASH_MAX) continue;
    if (hash !== HOME_HASH && !hash.startsWith('#/')) continue;
    tabs.push({
      hash,
      pinned: pinned === true,
      scroll:
        typeof scroll === 'number' && Number.isFinite(scroll) && scroll >= 0
          ? scroll
          : null,
    });
  }
  if (tabs.length === 0) return null;
  const at =
    typeof record.active === 'number' && Number.isInteger(record.active)
      ? Math.max(0, Math.min(tabs.length - 1, record.active))
      : 0;
  const chosen = tabs[at];
  const sorted = [
    ...tabs.filter((tab) => tab.pinned),
    ...tabs.filter((tab) => !tab.pinned),
  ];
  return { tabs: sorted, active: Math.max(0, sorted.indexOf(chosen!)) };
}

export interface Startup {
  state: TabsState;
  /** Scroll positions to restore, by entry key. */
  scrolls: Map<string, number>;
}

/**
 * The tabs at start. The address wins: a deep link opens (or finds) its tab
 * among the restored ones; an empty address shows the restored active tab.
 * `restore` false (Settings: open Home at start) ignores what was stored.
 */
export function startupTabs(
  stored: StoredTabs | null,
  address: string,
  restore: boolean,
): Startup {
  const hash = normaliseHash(address);
  const scrolls = new Map<string, number>();
  if (stored === null || !restore) {
    return { state: emptyState(hash), scrolls };
  }
  let state: TabsState = { tabs: [], active: '', closed: [], seq: 0 };
  stored.tabs.forEach((item, index) => {
    const { tab, seq } = newTab(state, normaliseHash(item.hash), item.pinned);
    // The stored active tab counts as the most recently used
    const used = index === stored.active ? seq + TABS_MAX : seq;
    state = { ...state, tabs: [...state.tabs, { ...tab, used }], seq };
    if (item.scroll !== null) scrolls.set(tab.entries[0]!.key, item.scroll);
  });
  state = {
    ...state,
    seq: state.seq + TABS_MAX,
    active: state.tabs[stored.active]?.id ?? state.tabs[0]!.id,
  };
  if (hash === HOME_HASH && address !== HOME_HASH) return { state, scrolls };
  if (currentHash(activeTab(state)) === hash) return { state, scrolls };
  const same = state.tabs.find((tab) => currentHash(tab) === hash);
  if (same !== undefined) return { state: activate(state, same.id), scrolls };
  return { state: tabsReducer(state, { type: 'open', hash }), scrolls };
}
