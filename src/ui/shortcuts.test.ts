import { describe, expect, it } from 'vitest';

import {
  SEQUENCE_MS,
  SHORTCUTS,
  chordOf,
  formatChord,
  isMacPlatform,
  isTypingTarget,
  resolveKey,
  type KeyContext,
  type KeyInput,
} from './shortcuts';

const key = (over: Partial<KeyInput>): KeyInput => ({
  key: 'a',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  isComposing: false,
  ...over,
});

const context = (over: Partial<KeyContext> = {}): KeyContext => ({
  typing: false,
  modalOpen: false,
  enabled: () => true,
  ...over,
});

describe('chordOf', () => {
  it('names mod as ⌘ on macOS and Ctrl elsewhere', () => {
    expect(chordOf(key({ key: 'k', metaKey: true }), true)).toBe('mod+k');
    expect(chordOf(key({ key: 'K', ctrlKey: true }), false)).toBe('mod+k');
    expect(chordOf(key({ key: 'k', ctrlKey: true }), true)).toBe('ctrl+k');
    expect(chordOf(key({ key: 'k', metaKey: true }), false)).toBe('meta+k');
  });

  it('keeps plain keys as typed', () => {
    expect(chordOf(key({ key: '?' }), false)).toBe('?');
    expect(chordOf(key({ key: 'J' }), false)).toBe('J');
    expect(chordOf(key({ key: 'ArrowDown', altKey: true }), false)).toBe(
      'alt+ArrowDown',
    );
  });

  it('ignores modifiers alone and input-method composition', () => {
    expect(chordOf(key({ key: 'Shift' }), false)).toBeNull();
    expect(chordOf(key({ key: 'g', isComposing: true }), false)).toBeNull();
    expect(chordOf(key({ key: 'Process' }), false)).toBeNull();
  });
});

describe('isTypingTarget', () => {
  it('treats text fields as typing', () => {
    expect(isTypingTarget('INPUT', 'search', false)).toBe(true);
    expect(isTypingTarget('INPUT', 'text', false)).toBe(true);
    expect(isTypingTarget('TEXTAREA', '', false)).toBe(true);
    expect(isTypingTarget('SELECT', '', false)).toBe(true);
    expect(isTypingTarget('DIV', '', true)).toBe(true);
  });

  it('does not treat buttons and checkboxes as typing', () => {
    expect(isTypingTarget('INPUT', 'checkbox', false)).toBe(false);
    expect(isTypingTarget('BUTTON', '', false)).toBe(false);
    expect(isTypingTarget('BODY', '', false)).toBe(false);
  });
});

describe('resolveKey', () => {
  it('matches single keys', () => {
    expect(resolveKey(SHORTCUTS, null, '?', 0, context()).id).toBe('help');
    expect(resolveKey(SHORTCUTS, null, 'mod+k', 0, context()).id).toBe(
      'palette',
    );
    expect(resolveKey(SHORTCUTS, null, 'alt+ArrowDown', 0, context()).id).toBe(
      'next-doc',
    );
  });

  it('matches two-key sequences within the timeout', () => {
    const first = resolveKey(SHORTCUTS, null, 'g', 100, context());
    expect(first).toEqual({ id: null, pending: { chords: ['g'], at: 100 } });
    expect(resolveKey(SHORTCUTS, first.pending, 'h', 200, context()).id).toBe(
      'go-health',
    );
    expect(resolveKey(SHORTCUTS, first.pending, 'g', 200, context()).id).toBe(
      'go-graph',
    );
    const late = resolveKey(
      SHORTCUTS,
      first.pending,
      'h',
      100 + SEQUENCE_MS + 1,
      context(),
    );
    expect(late).toEqual({ id: null, pending: null });
  });

  it('starts over when a sequence goes nowhere', () => {
    const first = resolveKey(SHORTCUTS, null, 'g', 0, context());
    expect(resolveKey(SHORTCUTS, first.pending, '?', 10, context()).id).toBe(
      'help',
    );
  });

  it('leaves text fields alone except for the palette', () => {
    const typing = context({ typing: true });
    expect(resolveKey(SHORTCUTS, null, 'j', 0, typing).id).toBeNull();
    expect(resolveKey(SHORTCUTS, null, '/', 0, typing).id).toBeNull();
    expect(resolveKey(SHORTCUTS, null, 'g', 0, typing).pending).toBeNull();
    expect(resolveKey(SHORTCUTS, null, 'mod+k', 0, typing).id).toBe('palette');
  });

  it('does nothing while a modal is open', () => {
    const modal = context({ modalOpen: true });
    expect(resolveKey(SHORTCUTS, null, 'mod+k', 0, modal).id).toBeNull();
    expect(resolveKey(SHORTCUTS, null, '?', 0, modal).id).toBeNull();
  });

  it('skips shortcuts with no handler bound, and browser shortcuts', () => {
    const graphOnly = context({ enabled: (id) => id !== 'next-doc' });
    expect(resolveKey(SHORTCUTS, null, 'j', 0, graphOnly).id).toBeNull();
    expect(resolveKey(SHORTCUTS, null, 'mod+f', 0, context()).id).toBeNull();
    expect(resolveKey(SHORTCUTS, null, 'ctrl+k', 0, context()).id).toBeNull();
    expect(resolveKey(SHORTCUTS, null, 'J', 0, context()).id).toBeNull();
  });

  it('defines every key sequence once', () => {
    const all = SHORTCUTS.flatMap((def) => def.keys.map((k) => k.join(' ')));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('formatChord', () => {
  it('shows the platform’s modifier names', () => {
    expect(formatChord('mod+k', true)).toEqual(['⌘', 'K']);
    expect(formatChord('mod+k', false)).toEqual(['Ctrl', 'K']);
    expect(formatChord('alt+ArrowUp', false)).toEqual(['Alt', '↑']);
    expect(formatChord('j', false)).toEqual(['j']);
  });
});

describe('isMacPlatform', () => {
  it('reads the platform string', () => {
    expect(isMacPlatform('MacIntel')).toBe(true);
    expect(isMacPlatform('macOS')).toBe(true);
    expect(isMacPlatform('Win32')).toBe(false);
    expect(isMacPlatform('Linux x86_64')).toBe(false);
  });
});
