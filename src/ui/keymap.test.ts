import { describe, expect, it } from 'vitest';

import {
  conflictsOf,
  defaultBindings,
  effectiveBindings,
  isDefault,
  normaliseChord,
  parseOverrides,
  rebind,
  refusal,
  reservedReason,
  resetOne,
  serialiseOverrides,
  stepRecorder,
  unbind,
  type Platform,
  type Recorder,
  type RecorderEvent,
} from './keymap';
import { SEQUENCE_MS, SHORTCUTS } from './shortcuts';

const browser: Platform = { desktop: false, mac: false };
const browserMac: Platform = { desktop: false, mac: true };
const desktop: Platform = { desktop: true, mac: false };
const desktopMac: Platform = { desktop: true, mac: true };

describe('defaults', () => {
  it('uses the natural tab keys in the desktop app only', () => {
    expect(defaultBindings(browser)['close-tab']).toEqual([['alt+w']]);
    expect(defaultBindings(desktop)['close-tab']).toEqual([['mod+w']]);
    expect(defaultBindings(desktop)['next-tab'][0]).toEqual(['mod+Tab']);
    expect(defaultBindings(desktopMac)['next-tab'][0]).toEqual(['ctrl+Tab']);
  });

  it('has no default that its own mode refuses or that clashes', () => {
    for (const platform of [browser, browserMac, desktop, desktopMac]) {
      const bindings = defaultBindings(platform);
      for (const def of SHORTCUTS) {
        for (const sequence of bindings[def.id]) {
          expect(
            refusal(sequence, platform),
            `${def.id} ${sequence.join(' ')}`,
          ).toBeNull();
          expect(conflictsOf(bindings, def.id, sequence), def.id).toEqual([]);
        }
      }
    }
  });
});

describe('chords', () => {
  it('normalises modifier order and letter case', () => {
    expect(normaliseChord('shift+mod+K')).toBe('mod+shift+k');
    expect(normaliseChord('mod++')).toBe('mod++');
    expect(normaliseChord('g')).toBe('g');
    expect(normaliseChord('T')).toBe('T');
    expect(normaliseChord('hyper+k')).toBeNull();
    expect(normaliseChord('mod+Banana')).toBeNull();
    expect(normaliseChord('')).toBeNull();
  });
});

describe('stored overrides', () => {
  it('round-trips only what differs from the defaults', () => {
    const bindings = rebind(defaultBindings(browser), 'help', 0, ['h']);
    const raw = serialiseOverrides(bindings, browser);
    expect(JSON.parse(raw)).toEqual({ help: [['h']] });
    expect(effectiveBindings(browser, parseOverrides(raw)).help).toEqual([
      ['h'],
    ]);
  });

  it('falls back to the default per shortcut for unreadable values', () => {
    const raw = JSON.stringify({
      help: [['h']],
      palette: 'mod+k',
      filter: [['a', 'b', 'c']],
      'no-such': [['x']],
    });
    const bindings = effectiveBindings(browser, parseOverrides(raw));
    expect(bindings.help).toEqual([['h']]);
    expect(bindings.palette).toEqual([['mod+k']]);
    expect(bindings.filter).toEqual([['/']]);
    expect(parseOverrides('{broken')).toEqual({});
    expect(parseOverrides('[1]')).toEqual({});
  });

  it('keeps an unbound shortcut unbound', () => {
    const bindings = unbind(defaultBindings(browser), 'top', 0);
    const back = effectiveBindings(
      browser,
      parseOverrides(serialiseOverrides(bindings, browser)),
    );
    expect(back.top).toEqual([]);
    expect(isDefault(resetOne(back, browser, 'top'), browser, 'top')).toBe(
      true,
    );
  });
});

describe('reserved keys', () => {
  it('refuses browser tab keys in a browser, not in the desktop app', () => {
    expect(reservedReason('mod+t', browser)).toMatch(/browser/);
    expect(reservedReason('mod+t', desktop)).toBeNull();
    expect(reservedReason('ctrl+Tab', browserMac)).toMatch(/browser/);
  });

  it('refuses the desktop menu’s accelerators in the desktop app', () => {
    expect(reservedReason('mod+o', desktop)).toMatch(/menu/);
    // Repository → Switch Branch…
    expect(reservedReason('mod+shift+b', desktop)).toMatch(/menu/);
    expect(reservedReason('mod+shift+b', browser)).toBeNull();
    expect(reservedReason('mod+q', desktopMac)).toMatch(/menu/);
  });

  it('refuses keys that would break typing, editing and the OS', () => {
    expect(reservedReason('Tab', browser)).toMatch(/focus/);
    expect(reservedReason('shift+ArrowDown', browser)).toMatch(/focus/);
    expect(reservedReason('mod+c', desktop)).toMatch(/editing/);
    expect(reservedReason('alt+F4', desktop)).toMatch(/operating system/);
    expect(reservedReason('meta+e', browser)).toMatch(/Windows/);
    expect(reservedReason('mod+Tab', desktopMac)).toMatch(/operating system/);
  });

  it('allows plain letters and refuses a modified first key in a sequence', () => {
    expect(refusal(['x'], browser)).toBeNull();
    expect(refusal(['mod+k', 'x'], browser)).toMatch(/plain key/);
  });
});

describe('conflicts', () => {
  const bindings = defaultBindings(browser);

  it('finds the same keys and prefixes where both apply', () => {
    expect(conflictsOf(bindings, 'top', ['j'])).toEqual([
      { id: 'next-doc', index: 0 },
    ]);
    expect(conflictsOf(bindings, 'help', ['g'])).toEqual(
      expect.arrayContaining([
        { id: 'go-docs', index: 0 },
        { id: 'go-graph', index: 0 },
      ]),
    );
  });

  it('lets the doc pages and the graph share a key', () => {
    expect(conflictsOf(bindings, 'graph-fit', ['m'])).toEqual([]);
  });

  it('replaces or swaps the clashing binding', () => {
    const replaced = rebind(bindings, 'top', 0, ['j']);
    expect(replaced.top).toEqual([['j']]);
    expect(replaced['next-doc']).toEqual([['alt+ArrowDown']]);
    const swapped = rebind(bindings, 'top', 0, ['j'], 'swap');
    expect(swapped['next-doc']).toEqual([['t'], ['alt+ArrowDown']]);
  });
});

describe('the key recorder', () => {
  const play = (events: RecorderEvent[]) => {
    let state: Recorder = { phase: 'idle' };
    let last = null as ReturnType<typeof stepRecorder> | null;
    for (const event of events) {
      last = stepRecorder(state, event);
      state = last.state;
    }
    return last!;
  };

  it('takes a modified chord at once', () => {
    const step = play([
      { type: 'start', now: 0 },
      { type: 'key', chord: 'mod+j', now: 1 },
    ]);
    expect(step.done).toEqual(['mod+j']);
  });

  it('takes two plain keys as a sequence, or one after a pause or Enter', () => {
    expect(
      play([
        { type: 'start', now: 0 },
        { type: 'key', chord: 'g', now: 1 },
        { type: 'key', chord: 'x', now: 2 },
      ]).done,
    ).toEqual(['g', 'x']);
    expect(
      play([
        { type: 'start', now: 0 },
        { type: 'key', chord: 'x', now: 1 },
        { type: 'timeout', now: 1 + SEQUENCE_MS },
      ]).done,
    ).toEqual(['x']);
    expect(
      play([
        { type: 'start', now: 0 },
        { type: 'key', chord: 'x', now: 1 },
        { type: 'key', chord: 'Enter', now: 2 },
      ]).done,
    ).toEqual(['x']);
  });

  it('cancels on Esc and ignores bare modifiers', () => {
    const step = play([
      { type: 'start', now: 0 },
      { type: 'key', chord: null, now: 1 },
      { type: 'key', chord: 'Escape', now: 2 },
    ]);
    expect(step.cancelled).toBe(true);
    expect(step.done).toBeNull();
  });
});
