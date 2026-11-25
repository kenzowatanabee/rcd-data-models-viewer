/**
 * The keyboard shortcuts: what each one is, in one table, and the pure rules
 * that turn key presses into a shortcut. Handlers are bound in
 * ShortcutLayer.tsx; the help dialog is generated from this table.
 */

export type ShortcutId =
  | 'palette'
  | 'help'
  | 'filter'
  | 'go-docs'
  | 'go-graph'
  | 'go-health'
  | 'toggle-sidebar'
  | 'toggle-panel'
  | 'next-doc'
  | 'previous-doc'
  | 'top'
  | 'toggle-source'
  | 'graph-fit'
  | 'graph-actual';

export type Where = 'Everywhere' | 'Doc pages' | 'Lineage graph';

export interface ShortcutDef {
  id: ShortcutId;
  /** Alternatives; each is a sequence of chords such as `mod+k` or `g`. */
  keys: string[][];
  label: string;
  where: Where;
  /** Also fires while typing in a text field. */
  inInputs?: boolean;
}

export const SHORTCUTS: readonly ShortcutDef[] = [
  {
    id: 'palette',
    keys: [['mod+k']],
    label: 'Quick open: docs, headings and commands',
    where: 'Everywhere',
    inInputs: true,
  },
  {
    id: 'help',
    keys: [['?']],
    label: 'Show these shortcuts',
    where: 'Everywhere',
  },
  {
    id: 'filter',
    keys: [['/']],
    label: 'Focus the sidebar filter (the find box on the graph)',
    where: 'Everywhere',
  },
  {
    id: 'go-docs',
    keys: [['g', 'd']],
    label: 'Go to Docs',
    where: 'Everywhere',
  },
  {
    id: 'go-graph',
    keys: [['g', 'g']],
    label: 'Go to the lineage graph',
    where: 'Everywhere',
  },
  {
    id: 'go-health',
    keys: [['g', 'h']],
    label: 'Go to Docs health',
    where: 'Everywhere',
  },
  {
    id: 'toggle-sidebar',
    keys: [['[']],
    label: 'Show or hide the sidebar',
    where: 'Doc pages',
  },
  {
    id: 'toggle-panel',
    keys: [[']']],
    label: 'Show or hide the right-hand panel',
    where: 'Everywhere',
  },
  {
    id: 'next-doc',
    keys: [['j'], ['alt+ArrowDown']],
    label: 'Next doc in the sidebar',
    where: 'Doc pages',
  },
  {
    id: 'previous-doc',
    keys: [['k'], ['alt+ArrowUp']],
    label: 'Previous doc in the sidebar',
    where: 'Doc pages',
  },
  { id: 'top', keys: [['t']], label: 'Back to the top', where: 'Doc pages' },
  {
    id: 'toggle-source',
    keys: [['m']],
    label: 'Switch between the rendered page and its Markdown',
    where: 'Doc pages',
  },
  {
    id: 'graph-fit',
    keys: [['f']],
    label: 'Fit everything shown to the window',
    where: 'Lineage graph',
  },
  {
    id: 'graph-actual',
    keys: [['0']],
    label: 'Zoom to actual size (100%)',
    where: 'Lineage graph',
  },
];

/** Keys handled where they apply, listed in the help dialog only. */
export const LOCAL_KEYS: readonly {
  keys: string[][];
  label: string;
  where: Where | 'Quick open' | 'Sidebar';
}[] = [
  {
    keys: [['ArrowUp'], ['ArrowDown']],
    label: 'Move through the list',
    where: 'Quick open',
  },
  { keys: [['Enter']], label: 'Open the doc', where: 'Quick open' },
  {
    keys: [['mod+Enter']],
    label: 'Open it in the lineage graph instead',
    where: 'Quick open',
  },
  {
    keys: [['ArrowUp'], ['ArrowDown']],
    label: 'Move through the docs and groups; Esc clears the filter',
    where: 'Sidebar',
  },
  {
    keys: [['ArrowRight'], ['ArrowLeft']],
    label: 'Open or close a group; ← from a doc goes to its group',
    where: 'Sidebar',
  },
  {
    keys: [['Home'], ['End']],
    label: 'First or last item',
    where: 'Sidebar',
  },
  {
    keys: [['p']],
    label: 'Pin or unpin the focused doc',
    where: 'Sidebar',
  },
  {
    keys: [['a']],
    label: 'Type the start of a name (after RCD_ and the like) to jump to it',
    where: 'Sidebar',
  },
  {
    keys: [['Escape']],
    label: 'Clear the second node, then the selection',
    where: 'Lineage graph',
  },
  {
    keys: [['ArrowLeft'], ['ArrowRight']],
    label: 'On a node: move upstream or downstream',
    where: 'Lineage graph',
  },
  {
    keys: [['Enter']],
    label: 'On a node: select it (Shift+Enter: path to it)',
    where: 'Lineage graph',
  },
];

/** Two-key sequences must be finished within this time. */
export const SEQUENCE_MS = 1200;

export interface KeyInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  isComposing: boolean;
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph']);

/**
 * The chord a key press makes, such as `mod+k`, `alt+ArrowDown` or `?`; null
 * for a bare modifier or a key typed through an input method. `mod` is ⌘ on
 * macOS and Ctrl elsewhere; the other one is kept apart so it matches nothing.
 */
export function chordOf(input: KeyInput, mac: boolean): string | null {
  const { key } = input;
  if (input.isComposing || key === 'Process' || key === 'Dead') return null;
  if (key === '' || MODIFIER_KEYS.has(key)) return null;
  const mod = mac ? input.metaKey : input.ctrlKey;
  const other = mac ? input.ctrlKey : input.metaKey;
  const parts: string[] = [];
  if (other) parts.push(mac ? 'ctrl' : 'meta');
  if (mod) parts.push('mod');
  if (input.altKey) parts.push('alt');
  // Letters with a modifier come as `K` with Shift or caps lock
  parts.push(key.length === 1 && parts.length > 0 ? key.toLowerCase() : key);
  return parts.join('+');
}

/** Text fields: shortcuts leave them alone so typing is never hijacked. */
export function isTypingTarget(
  tag: string,
  type: string,
  editable: boolean,
): boolean {
  if (editable) return true;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range'].includes(
    type.toLowerCase(),
  );
}

export interface Pending {
  chords: string[];
  at: number;
}

export interface KeyContext {
  typing: boolean;
  /** A modal dialog is open; it handles its own keys. */
  modalOpen: boolean;
  /** Shortcuts with a handler bound where the reader is. */
  enabled: (id: ShortcutId) => boolean;
}

export interface Resolution {
  id: ShortcutId | null;
  /** The start of a sequence waiting for its next key. */
  pending: Pending | null;
}

const startsWith = (sequence: string[], prefix: string[]) =>
  prefix.every((chord, index) => sequence[index] === chord);

/** What a chord does, given the sequence typed so far. */
export function resolveKey(
  defs: readonly ShortcutDef[],
  pending: Pending | null,
  chord: string | null,
  now: number,
  context: KeyContext,
): Resolution {
  if (chord === null) return { id: null, pending };
  if (context.modalOpen) return { id: null, pending: null };
  const sequences = defs
    .filter(
      (def) => context.enabled(def.id) && (!context.typing || def.inInputs),
    )
    .flatMap((def) => def.keys.map((keys) => ({ id: def.id, keys })));
  const attempt = (chords: string[]): Resolution | null => {
    const full = sequences.find(
      (sequence) =>
        sequence.keys.length === chords.length &&
        startsWith(sequence.keys, chords),
    );
    if (full) return { id: full.id, pending: null };
    const partial = sequences.some(
      (sequence) =>
        sequence.keys.length > chords.length &&
        startsWith(sequence.keys, chords),
    );
    return partial ? { id: null, pending: { chords, at: now } } : null;
  };
  const live =
    pending !== null && now - pending.at <= SEQUENCE_MS ? pending.chords : [];
  if (live.length > 0) {
    const continued = attempt([...live, chord]);
    if (continued) return continued;
  }
  return attempt([chord]) ?? { id: null, pending: null };
}

const NAMED: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Escape: 'Esc',
  Enter: 'Enter',
};

/** The keys of a chord as shown to the reader: `⌘ K` or `Ctrl K`. */
export function formatChord(chord: string, mac: boolean): string[] {
  const parts = chord.split('+');
  const key = parts.pop() ?? '';
  const shown = parts.map((part) => {
    if (part === 'mod') return mac ? '⌘' : 'Ctrl';
    if (part === 'alt') return mac ? '⌥' : 'Alt';
    if (part === 'ctrl') return 'Ctrl';
    return part;
  });
  // Plain letters stay lower case so `j` does not read as Shift+J
  shown.push(
    NAMED[key] ??
      (key.length === 1 && parts.length > 0 ? key.toUpperCase() : key),
  );
  return shown;
}

/** macOS, from `navigator.userAgentData.platform` or `navigator.platform`. */
export const isMacPlatform = (platform: string) =>
  /mac|iphone|ipad/i.test(platform);
