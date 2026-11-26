/**
 * Rebindable shortcuts, pure: the defaults per mode (browser or desktop app)
 * and platform, the reader's stored changes, and the rules a new binding
 * must pass. The table of shortcuts itself is in shortcuts.ts.
 */
import {
  SEQUENCE_MS,
  SHORTCUTS,
  splitChord,
  type ShortcutDef,
  type ShortcutId,
  type Where,
} from './shortcuts';

export interface Platform {
  /** The desktop app, where no browser takes Ctrl/⌘+T, W or Tab. */
  desktop: boolean;
  mac: boolean;
}

/** One shortcut's alternatives; each is a sequence of one or two chords. */
export type Sequences = string[][];
export type Bindings = Record<ShortcutId, Sequences>;
/** Only what differs from the defaults is stored. */
export type Overrides = Partial<Record<ShortcutId, Sequences>>;

export function defaultKeys(def: ShortcutDef, platform: Platform): Sequences {
  if (platform.desktop && platform.mac && def.desktopMac) return def.desktopMac;
  if (platform.desktop && def.desktop) return def.desktop;
  return def.keys;
}

export function defaultBindings(platform: Platform): Bindings {
  return Object.fromEntries(
    SHORTCUTS.map((def) => [def.id, defaultKeys(def, platform)]),
  ) as Bindings;
}

export function effectiveBindings(
  platform: Platform,
  overrides: Overrides,
): Bindings {
  const bindings = defaultBindings(platform);
  for (const def of SHORTCUTS) {
    const own = overrides[def.id];
    if (own !== undefined) bindings[def.id] = own;
  }
  return bindings;
}

/** The table with the keys in force, for the key handler and the help. */
export const boundDefs = (bindings: Bindings): ShortcutDef[] =>
  SHORTCUTS.map((def) => ({ ...def, keys: bindings[def.id] }));

const MODIFIERS = ['ctrl', 'meta', 'mod', 'alt', 'shift'] as const;
const NAMED_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Enter',
  'Escape',
  'Tab',
  'Backspace',
  'Delete',
  'Insert',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
]);

/** The chord in canonical form (modifiers in a fixed order), or null. */
export function normaliseChord(chord: string): string | null {
  if (typeof chord !== 'string' || chord === '' || chord.length > 40) {
    return null;
  }
  const { mods, key } = splitChord(chord);
  if (key === '') return null;
  if ([...key].length !== 1 && !NAMED_KEYS.has(key)) return null;
  const set = new Set(mods);
  if (set.size !== mods.length) return null;
  if (mods.some((mod) => !(MODIFIERS as readonly string[]).includes(mod))) {
    return null;
  }
  if (set.has('ctrl') && set.has('meta')) return null;
  const ordered = MODIFIERS.filter((mod) => set.has(mod));
  const shownKey =
    key.length === 1 && ordered.length > 0 ? key.toLowerCase() : key;
  return [...ordered, shownKey].join('+');
}

/** A sequence of one or two valid chords, normalised; null otherwise. */
export function normaliseSequence(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
    return null;
  }
  const chords: string[] = [];
  for (const chord of value) {
    if (typeof chord !== 'string') return null;
    const normal = normaliseChord(chord);
    if (normal === null) return null;
    chords.push(normal);
  }
  return chords;
}

const sameSequence = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((chord, i) => chord === b[i]);

const sameSequences = (a: Sequences, b: Sequences) =>
  a.length === b.length && a.every((seq, i) => sameSequence(seq, b[i] ?? []));

const MAX_ALTERNATIVES = 4;
const KNOWN = new Set<string>(SHORTCUTS.map((def) => def.id));

/**
 * Stored changes; an unknown shortcut, or one whose value cannot be read,
 * is dropped, so that shortcut keeps its default.
 */
export function parseOverrides(raw: string | null): Overrides {
  if (raw === null) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {};
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const result: Overrides = {};
  for (const [id, sequences] of Object.entries(value)) {
    if (!KNOWN.has(id) || !Array.isArray(sequences)) continue;
    if (sequences.length > MAX_ALTERNATIVES) continue;
    const parsed = sequences.map(normaliseSequence);
    if (parsed.some((seq) => seq === null)) continue;
    result[id as ShortcutId] = parsed as string[][];
  }
  return result;
}

/** Stores the bindings that differ from the defaults. */
export function serialiseOverrides(
  bindings: Bindings,
  platform: Platform,
): string {
  const defaults = defaultBindings(platform);
  const changed: Overrides = {};
  for (const def of SHORTCUTS) {
    if (!sameSequences(bindings[def.id], defaults[def.id])) {
      changed[def.id] = bindings[def.id];
    }
  }
  return JSON.stringify(changed);
}

export const isDefault = (
  bindings: Bindings,
  platform: Platform,
  id: ShortcutId,
) => sameSequences(bindings[id], defaultBindings(platform)[id]);

// Keys a binding may not take. Each list gives the reason shown.

const EDITING = ['mod+c', 'mod+v', 'mod+x', 'mod+a', 'mod+z', 'mod+shift+z'];

/** Taken by every browser before the page sees them (Chrome, Edge, Firefox). */
const BROWSER_COMMON = [
  'mod+t',
  'mod+n',
  'mod+w',
  'mod+shift+t',
  'mod+shift+n',
  'mod+shift+w',
  'mod+Tab',
  'mod+shift+Tab',
  'mod+PageUp',
  'mod+PageDown',
  'mod+l',
  'mod+r',
  'mod+shift+r',
  'mod+q',
  'F5',
  'F11',
  'F12',
  'mod+shift+i',
  'mod+shift+j',
  ...Array.from({ length: 9 }, (_, i) => `mod+${i + 1}`),
];
const BROWSER_MAC = [
  'ctrl+Tab',
  'ctrl+shift+Tab',
  'mod+alt+i',
  'mod+[',
  'mod+]',
  'mod+h',
  'mod+m',
];

/** The desktop app's menu accelerators (menu.ts) and Electron's roles. */
const DESKTOP_COMMON = [
  'mod+o',
  'mod+shift+f',
  'mod+shift+p',
  'mod+shift+w',
  'mod+r',
  'mod+shift+r',
  'mod+0',
  'mod+=',
  'mod++',
  'mod+-',
  'mod+shift+=',
];
const DESKTOP_MAC = [
  'mod+q',
  'mod+h',
  'mod+alt+h',
  'mod+m',
  'mod+alt+i',
  'ctrl+mod+f',
];
const DESKTOP_OTHER = ['mod+q', 'mod+shift+i', 'F11'];

/** The operating system's own: app switching, spaces, the Windows key. */
const OS_MAC = [
  'mod+Tab',
  'mod+shift+Tab',
  'mod+ ',
  'mod+`',
  'ctrl+ArrowLeft',
  'ctrl+ArrowRight',
  'ctrl+ArrowUp',
  'ctrl+ArrowDown',
];
const OS_OTHER = ['alt+Tab', 'alt+F4', 'alt+ ', 'mod+alt+Delete'];

/** Keys that move focus, scroll or edit: taking them would break the page. */
const TYPING = [
  'Tab',
  'shift+Tab',
  'Enter',
  'Escape',
  ' ',
  'Backspace',
  'Delete',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
];

/** Why `chord` cannot be bound in this mode, or null when it can. */
export function reservedReason(
  chord: string,
  platform: Platform,
): string | null {
  const { mods } = splitChord(chord);
  if (
    TYPING.includes(chord) ||
    (mods.length === 1 &&
      mods[0] === 'shift' &&
      TYPING.includes(chord.slice(6)))
  ) {
    return 'This key moves focus, scrolls or edits text; taking it would break the page.';
  }
  if (EDITING.includes(chord)) return 'This is a text editing shortcut.';
  if (!platform.mac && mods.includes('meta')) {
    return 'Windows-key combinations belong to the operating system.';
  }
  const os = platform.mac ? OS_MAC : OS_OTHER;
  if (os.includes(chord)) return 'The operating system uses this shortcut.';
  if (platform.desktop) {
    const menu = [
      ...DESKTOP_COMMON,
      ...(platform.mac ? DESKTOP_MAC : DESKTOP_OTHER),
    ];
    if (menu.includes(chord)) {
      return 'The app’s menu uses this shortcut.';
    }
    return null;
  }
  const browser = [...BROWSER_COMMON, ...(platform.mac ? BROWSER_MAC : [])];
  if (browser.includes(chord)) {
    return 'The browser keeps this shortcut for itself; it never reaches the page.';
  }
  return null;
}

/** Why `sequence` cannot be bound, or null when it can. */
export function refusal(
  sequence: readonly string[],
  platform: Platform,
): string | null {
  if (sequence.length === 0) return 'No key was pressed.';
  const first = sequence[0] ?? '';
  if (sequence.length === 2 && splitChord(first).mods.length > 0) {
    return 'A two-key sequence starts with a plain key, such as g then d.';
  }
  for (const chord of sequence) {
    const reason = reservedReason(chord, platform);
    if (reason !== null) return reason;
  }
  return null;
}

/** Where two shortcuts can both be live at once. */
export const overlaps = (a: Where, b: Where) =>
  a === b ||
  a === 'Everywhere' ||
  b === 'Everywhere' ||
  a === 'Tabs' ||
  b === 'Tabs';

const isPrefix = (a: readonly string[], b: readonly string[]) =>
  a.length <= b.length && a.every((chord, i) => chord === b[i]);

export interface Conflict {
  id: ShortcutId;
  /** Which of its alternatives clashes. */
  index: number;
}

/**
 * Other bindings that `sequence` would clash with where both apply: the
 * same keys, or one a prefix of the other (`g` would swallow `g d`).
 */
export function conflictsOf(
  bindings: Bindings,
  id: ShortcutId,
  sequence: readonly string[],
): Conflict[] {
  const where = SHORTCUTS.find((def) => def.id === id)?.where ?? 'Everywhere';
  const found: Conflict[] = [];
  for (const def of SHORTCUTS) {
    if (def.id === id || !overlaps(where, def.where)) continue;
    bindings[def.id].forEach((other, index) => {
      if (isPrefix(other, sequence) || isPrefix(sequence, other)) {
        found.push({ id: def.id, index });
      }
    });
  }
  return found;
}

/**
 * Sets alternative `index` of `id` to `sequence` (index past the end adds
 * one). `resolve` settles conflicts: `replace` removes the clashing
 * bindings, `swap` gives them the keys `id` had there.
 */
export function rebind(
  bindings: Bindings,
  id: ShortcutId,
  index: number,
  sequence: string[],
  resolve: 'replace' | 'swap' = 'replace',
): Bindings {
  const next: Bindings = { ...bindings };
  const previous = bindings[id][index] ?? null;
  for (const conflict of conflictsOf(bindings, id, sequence)) {
    const list = [...next[conflict.id]];
    if (resolve === 'swap' && previous !== null)
      list[conflict.index] = previous;
    else list.splice(conflict.index, 1);
    next[conflict.id] = list.filter(
      (seq, i, all) => all.findIndex((s) => sameSequence(s, seq)) === i,
    );
  }
  const own = [...next[id]];
  if (index < own.length) own[index] = sequence;
  else own.push(sequence);
  next[id] = own
    .filter((seq, i, all) => all.findIndex((s) => sameSequence(s, seq)) === i)
    .slice(0, MAX_ALTERNATIVES);
  return next;
}

export function unbind(
  bindings: Bindings,
  id: ShortcutId,
  index: number,
): Bindings {
  return { ...bindings, [id]: bindings[id].filter((_, i) => i !== index) };
}

export function resetOne(
  bindings: Bindings,
  platform: Platform,
  id: ShortcutId,
): Bindings {
  return { ...bindings, [id]: defaultBindings(platform)[id] };
}

/** `g then d`, `Ctrl+K`: for titles and accessible names. */
export function sequenceText(
  sequence: readonly string[],
  format: (chord: string) => string[],
): string {
  return sequence.map((chord) => format(chord).join('+')).join(' then ');
}

// The key recorder in Settings: press a chord, or two plain keys for a
// sequence; Enter keeps a single plain key at once, Esc cancels.

export type Recorder =
  { phase: 'idle' } | { phase: 'listening'; chords: string[]; at: number };

export type RecorderEvent =
  | { type: 'start'; now: number }
  | { type: 'key'; chord: string | null; now: number }
  | { type: 'timeout'; now: number }
  | { type: 'cancel' };

export interface RecorderStep {
  state: Recorder;
  /** The finished sequence, once there is one. */
  done: string[] | null;
  cancelled: boolean;
}

const IDLE: Recorder = { phase: 'idle' };

export function stepRecorder(
  state: Recorder,
  event: RecorderEvent,
): RecorderStep {
  const stay = { state, done: null, cancelled: false };
  if (event.type === 'start') {
    return {
      state: { phase: 'listening', chords: [], at: event.now },
      done: null,
      cancelled: false,
    };
  }
  if (state.phase === 'idle') return stay;
  if (event.type === 'cancel')
    return { state: IDLE, done: null, cancelled: true };
  if (event.type === 'timeout') {
    if (state.chords.length === 1 && event.now - state.at >= SEQUENCE_MS) {
      return { state: IDLE, done: state.chords, cancelled: false };
    }
    return stay;
  }
  const { chord } = event;
  if (chord === null) return stay;
  if (chord === 'Escape') return { state: IDLE, done: null, cancelled: true };
  const [first] = state.chords;
  if (first === undefined) {
    const modified = splitChord(chord).mods.length > 0 || chord.length > 1;
    if (modified) return { state: IDLE, done: [chord], cancelled: false };
    return {
      state: { phase: 'listening', chords: [chord], at: event.now },
      done: null,
      cancelled: false,
    };
  }
  if (chord === 'Enter')
    return { state: IDLE, done: [first], cancelled: false };
  return { state: IDLE, done: [first, chord], cancelled: false };
}
