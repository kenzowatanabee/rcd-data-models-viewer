import { describe, expect, it } from 'vitest';

import {
  CLOSED_MAX,
  HOME_HASH,
  activeTab,
  currentHash,
  emptyState,
  mountedIds,
  parseStoredTabs,
  serialiseTabs,
  startupTabs,
  tabsReducer,
  type TabsAction,
  type TabsState,
} from './tabsModel';

const run = (state: TabsState, ...actions: TabsAction[]) =>
  actions.reduce(tabsReducer, state);
const hashes = (state: TabsState) => state.tabs.map(currentHash);
const activeHash = (state: TabsState) => currentHash(activeTab(state));

const A = '#/doc/a.md';
const B = '#/doc/b.md';
const C = '#/doc/c.md';

describe('navigation and history', () => {
  it('pushes visits in the active tab and steps back and forward', () => {
    const state = run(
      emptyState(),
      { type: 'navigate', hash: A },
      { type: 'navigate', hash: B },
      { type: 'back' },
    );
    expect(activeHash(state)).toBe(A);
    expect(activeHash(run(state, { type: 'forward' }))).toBe(B);
    // A new visit drops the forward history
    const branched = run(
      state,
      { type: 'navigate', hash: C },
      { type: 'forward' },
    );
    expect(activeHash(branched)).toBe(C);
  });

  it('keeps each tab’s history apart', () => {
    const state = run(
      emptyState(A),
      { type: 'navigate', hash: B },
      { type: 'open', hash: C },
      { type: 'back' },
    );
    expect(activeHash(state)).toBe(C);
    const first = state.tabs[0]!;
    expect(currentHash(first)).toBe(B);
  });

  it('replaces the entry without adding history, with a fresh key', () => {
    const start = run(emptyState(A), { type: 'navigate', hash: B });
    const before = activeTab(start).entries[1]!.key;
    const state = run(start, {
      type: 'navigate',
      hash: `${B}?view=md`,
      replace: true,
    });
    expect(activeTab(state).entries).toHaveLength(2);
    expect(activeTab(state).entries[1]!.key).not.toBe(before);
  });

  it('reads an empty address as Home and ignores the same address', () => {
    const state = run(emptyState(A), { type: 'navigate', hash: '' });
    expect(activeHash(state)).toBe(HOME_HASH);
    expect(run(state, { type: 'navigate', hash: HOME_HASH })).toBe(state);
  });
});

describe('opening, closing and order', () => {
  const three = () =>
    run(emptyState(A), { type: 'open', hash: B }, { type: 'open', hash: C });

  it('opens next to the active tab, in the background when asked', () => {
    const state = run(emptyState(A), {
      type: 'open',
      hash: B,
      background: true,
    });
    expect(hashes(state)).toEqual([A, B]);
    expect(activeHash(state)).toBe(A);
  });

  it('activates the right-hand neighbour when the active tab closes', () => {
    const state = run(three(), { type: 'activate-index', index: 2 });
    const closed = run(state, { type: 'close', id: activeTab(state).id });
    expect(activeHash(closed)).toBe(C);
    const last = run(three(), { type: 'close', id: activeTab(three()).id });
    expect(activeHash(last)).toBe(B);
  });

  it('leaves one Home tab when the last tab closes', () => {
    const state = emptyState(A);
    const closed = run(state, { type: 'close', id: state.active });
    expect(hashes(closed)).toEqual([HOME_HASH]);
  });

  it('closes others and to the right, but not pinned tabs', () => {
    const state = run(three(), {
      type: 'pin',
      id: three().tabs[2]!.id,
      pinned: true,
    });
    expect(hashes(state)).toEqual([C, A, B]);
    const others = run(state, { type: 'close-others', id: state.tabs[1]!.id });
    expect(hashes(others)).toEqual([C, A]);
    const right = run(state, { type: 'close-right', id: state.tabs[0]!.id });
    expect(hashes(right)).toEqual([C]);
  });

  it('reorders within the pinned or unpinned block', () => {
    const state = run(three(), {
      type: 'pin',
      id: three().tabs[0]!.id,
      pinned: true,
    });
    const moved = run(state, { type: 'move', id: state.tabs[2]!.id, to: 0 });
    expect(hashes(moved)).toEqual([A, C, B]);
  });

  it('reopens closed tabs where they were, in a bounded stack', () => {
    const state = three();
    const closed = run(state, { type: 'close', id: state.tabs[1]!.id });
    const back = run(closed, { type: 'reopen' });
    expect(hashes(back)).toEqual([A, B, C]);
    expect(activeHash(back)).toBe(B);
    let many = emptyState(A);
    for (let i = 0; i < CLOSED_MAX + 5; i++) {
      many = run(
        many,
        { type: 'open', hash: `#/doc/${i}.md` },
        { type: 'close', id: many.active },
      );
      many = run(many, { type: 'close', id: many.active });
    }
    expect(many.closed.length).toBeLessThanOrEqual(CLOSED_MAX);
  });

  it('reopening after the last tab closed replaces the blank Home tab', () => {
    const state = emptyState(A);
    const back = run(
      state,
      { type: 'close', id: state.active },
      { type: 'reopen' },
    );
    expect(hashes(back)).toEqual([A]);
  });

  it('cycles and jumps by number, 9 being the last', () => {
    const state = three();
    expect(activeHash(run(state, { type: 'cycle', by: 1 }))).toBe(A);
    expect(activeHash(run(state, { type: 'activate-index', index: 1 }))).toBe(
      A,
    );
    expect(activeHash(run(state, { type: 'activate-index', index: 9 }))).toBe(
      C,
    );
  });

  it('reuses the most recent tab of a kind before opening one', () => {
    const state = run(emptyState('#/graph?depth=1'), { type: 'open', hash: A });
    const shown = run(state, {
      type: 'show-kind',
      kinds: ['graph'],
      hash: '#/graph',
    });
    expect(hashes(shown)).toHaveLength(2);
    expect(activeHash(shown)).toBe('#/graph?depth=1');
    const opened = run(state, {
      type: 'show-kind',
      kinds: ['health'],
      hash: '#/health',
    });
    expect(hashes(opened)).toHaveLength(3);
    expect(activeHash(opened)).toBe('#/health');
  });

  it('keeps the active and most recently used tabs mounted', () => {
    const state = run(three(), {
      type: 'open',
      hash: '#/health',
      background: true,
    });
    const ids = mountedIds(state, 2);
    expect(ids.has(state.active)).toBe(true);
    expect(ids.size).toBe(2);
  });
});

describe('persistence and start', () => {
  const stored = () => {
    const state = run(
      emptyState(A),
      { type: 'open', hash: B },
      { type: 'pin', id: 't1', pinned: true },
    );
    return parseStoredTabs(
      serialiseTabs(state, (key) => (key === 'e2' ? 120 : undefined)),
    );
  };

  it('round-trips tabs, pins, the active tab and scroll', () => {
    expect(stored()).toEqual({
      tabs: [
        { hash: A, pinned: true, scroll: null },
        { hash: B, pinned: false, scroll: 120 },
      ],
      active: 1,
    });
  });

  it('drops what cannot be read', () => {
    expect(parseStoredTabs('nope')).toBeNull();
    expect(parseStoredTabs('{"v":2,"tabs":[]}')).toBeNull();
    expect(
      parseStoredTabs(
        '{"v":1,"tabs":[{"hash":"http://x"},{"hash":"#/doc/a.md","scroll":-4}],"active":7}',
      ),
    ).toEqual({ tabs: [{ hash: A, pinned: false, scroll: null }], active: 0 });
  });

  it('restores on an empty address and opens a deep link as a tab', () => {
    const restored = startupTabs(stored(), '', true);
    expect(hashes(restored.state)).toEqual([A, B]);
    expect(activeHash(restored.state)).toBe(B);
    expect([...restored.scrolls.values()]).toEqual([120]);
    const linked = startupTabs(stored(), C, true);
    expect(hashes(linked.state)).toEqual([A, B, C]);
    expect(activeHash(linked.state)).toBe(C);
    const found = startupTabs(stored(), A, true);
    expect(hashes(found.state)).toEqual([A, B]);
    expect(activeHash(found.state)).toBe(A);
  });

  it('starts from the address alone when restoring is off', () => {
    expect(hashes(startupTabs(stored(), '', false).state)).toEqual([HOME_HASH]);
    expect(hashes(startupTabs(null, C, true).state)).toEqual([C]);
  });
});

describe('order of new tabs', () => {
  it('keeps a run of tabs opened from one tab in the order opened', () => {
    const state = run(
      emptyState(A),
      { type: 'open', hash: B, background: true },
      { type: 'open', hash: C, background: true },
    );
    expect(hashes(state)).toEqual([A, B, C]);
  });
});
