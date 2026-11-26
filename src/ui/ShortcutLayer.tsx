import { X } from 'lucide-react';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { ModalDialog } from './Dialog';
import { desktop } from './desktop';
import {
  boundDefs,
  effectiveBindings,
  parseOverrides,
  sequenceText,
  serialiseOverrides,
  type Bindings,
  type Platform,
} from './keymap';
import { STORAGE_KEYS } from './settings';
import {
  LOCAL_KEYS,
  SHORTCUTS,
  chordOf,
  formatChord,
  isMacPlatform,
  isTypingTarget,
  resolveKey,
  type Pending,
  type ShortcutId,
} from './shortcuts';

type Handler = () => void;

/** Handlers by shortcut; the one bound last wins while it is mounted. */
class Registry {
  private handlers = new Map<ShortcutId, Handler[]>();

  bind(id: ShortcutId, handler: Handler): () => void {
    this.handlers.set(id, [...(this.handlers.get(id) ?? []), handler]);
    return () => {
      const left = (this.handlers.get(id) ?? []).filter((h) => h !== handler);
      this.handlers.set(id, left);
    };
  }

  handler(id: ShortcutId): Handler | undefined {
    const list = this.handlers.get(id) ?? [];
    return list[list.length - 1];
  }
}

const RegistryContext = createContext<Registry | null>(null);

function platformName(): string {
  const data = (
    navigator as Navigator & { userAgentData?: { platform: string } }
  ).userAgentData;
  return data?.platform ?? navigator.platform;
}

/** ⌘ on macOS, Ctrl elsewhere; read once. */
export const IS_MAC =
  desktop === null
    ? isMacPlatform(platformName())
    : desktop.platform === 'darwin';

export const PLATFORM: Platform = { desktop: desktop !== null, mac: IS_MAC };

function readBindings(): Bindings {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEYS.shortcuts);
  } catch {
    raw = null;
  }
  return effectiveBindings(PLATFORM, parseOverrides(raw));
}

/** The keys in force, shared by the key handler, Settings and every hint. */
let bindings: Bindings = readBindings();
const listeners = new Set<() => void>();

export const keymap = {
  get: () => bindings,
  set(next: Bindings) {
    bindings = next;
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.shortcuts,
        serialiseOverrides(next, PLATFORM),
      );
    } catch {
      // Not persisted; the bindings still apply until the page reloads
    }
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export const useBindings = () =>
  useSyncExternalStore(keymap.subscribe, keymap.get);

/** The first binding of a shortcut, or null when it has none. */
export function useBinding(id: ShortcutId): string[] | null {
  return useBindings()[id][0] ?? null;
}

export const formatSequence = (sequence: readonly string[]) =>
  sequenceText(sequence, (chord) => formatChord(chord, IS_MAC));

/** ` (g then d)` for a title, or nothing when the shortcut is unbound. */
export function useKeyHint(id: ShortcutId): string {
  const sequence = useBinding(id);
  return sequence === null ? '' : ` (${formatSequence(sequence)})`;
}

/** For `aria-keyshortcuts`: `Control+K`, `G D`; undefined when unbound. */
export function useAriaKeys(id: ShortcutId): string | undefined {
  const sequence = useBinding(id);
  if (sequence === null) return undefined;
  return sequence
    .map((chord) =>
      chord
        .split('+')
        .map((part) =>
          part === 'mod'
            ? IS_MAC
              ? 'Meta'
              : 'Control'
            : part === 'alt'
              ? 'Alt'
              : part === 'shift'
                ? 'Shift'
                : part === 'ctrl'
                  ? 'Control'
                  : part,
        )
        .join('+'),
    )
    .join(' ');
}

/** Whether the views below belong to the active tab; hidden tabs bind none. */
export const PaneActiveContext = createContext(true);
export const usePaneActive = () => useContext(PaneActiveContext);

/** One keydown listener for every shortcut in the table. */
export function ShortcutProvider({ children }: { children: ReactNode }) {
  const registry = useMemo(() => new Registry(), []);
  useEffect(() => {
    let pending: Pending | null = null;
    const onKey = (event: KeyboardEvent) => {
      // Left to whatever handled it first (the graph canvas, a menu)
      if (event.defaultPrevented) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const result = resolveKey(
        boundDefs(keymap.get()),
        pending,
        chordOf(event, IS_MAC),
        event.timeStamp,
        {
          typing: isTypingTarget(
            target?.tagName ?? '',
            target instanceof HTMLInputElement ? target.type : '',
            target?.isContentEditable ?? false,
          ),
          modalOpen:
            document.querySelector('dialog[open], .context-menu') !== null,
          enabled: (id) => registry.handler(id) !== undefined,
        },
      );
      pending = result.pending;
      if (result.id === null) return;
      event.preventDefault();
      registry.handler(result.id)?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [registry]);
  return (
    <RegistryContext.Provider value={registry}>
      {children}
    </RegistryContext.Provider>
  );
}

/**
 * Binds a shortcut while the component is mounted; null leaves it unbound,
 * so the key does nothing there and is not taken from the browser.
 */
export function useShortcut(id: ShortcutId, handler: Handler | null) {
  const registry = useContext(RegistryContext);
  const active = useContext(PaneActiveContext);
  const latest = useRef(handler);
  useLayoutEffect(() => {
    latest.current = handler;
  });
  const bound = handler !== null && active;
  useEffect(() => {
    if (registry === null || !bound) return;
    return registry.bind(id, () => latest.current?.());
  }, [registry, id, bound]);
}

/** The first binding of a shortcut as key caps; nothing when unbound. */
export function ShortcutKeys({ id }: { id: ShortcutId }) {
  const sequence = useBinding(id);
  if (sequence === null) return null;
  return (
    <span className="key-sequence">
      {sequence.map((chord, at) => (
        <span key={at} className="key-step">
          <Keys chord={chord} />
        </span>
      ))}
    </span>
  );
}

export function Keys({ chord }: { chord: string }) {
  return (
    <span className="keys">
      {formatChord(chord, IS_MAC).map((key, index) => (
        <kbd key={index}>{key}</kbd>
      ))}
    </span>
  );
}

function KeyList({ keys }: { keys: string[][] }) {
  return (
    <span className="key-list">
      {keys.map((sequence, index) => (
        <span key={index} className="key-sequence">
          {index > 0 && <span className="muted">or</span>}
          {sequence.map((chord, at) => (
            <span key={at} className="key-step">
              {at > 0 && (
                <span className="muted" aria-label="then">
                  then
                </span>
              )}
              <Keys chord={chord} />
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

export const GROUPS = [
  'Everywhere',
  'Tabs',
  'Doc pages',
  'Lineage graph',
  'Quick open',
  'Sidebar',
] as const;

/** Generated from the shortcut table, so it cannot fall out of date. */
export function ShortcutHelp({
  onClose,
  onSettings,
}: {
  onClose: () => void;
  onSettings: () => void;
}) {
  const bound = useBindings();
  const rows = [
    ...SHORTCUTS.map((def) => ({
      keys: bound[def.id],
      label: def.label,
      where: def.where,
    })),
    ...LOCAL_KEYS,
  ];
  return (
    <ModalDialog
      className="modal shortcut-help"
      labelledBy="shortcut-help-title"
      onClose={onClose}
      closeOnBackdrop
    >
      <div className="modal-header">
        <h2 id="shortcut-help-title">Keyboard shortcuts</h2>
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-icon"
          aria-label="Close"
          title="Close (Esc)"
          onClick={onClose}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
      <div className="modal-body shortcut-groups">
        {GROUPS.map((group) => (
          <section key={group} className="shortcut-group">
            <h3>{group}</h3>
            <dl>
              {rows
                .filter((row) => row.where === group)
                .map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>
                      {row.keys.length === 0 ? (
                        <span className="muted">None</span>
                      ) : (
                        <KeyList keys={row.keys} />
                      )}
                    </dd>
                  </div>
                ))}
            </dl>
          </section>
        ))}
        <p className="muted shortcut-note">
          Shortcuts do nothing while you type in a text field, except quick
          open. Change them in{' '}
          <button type="button" className="link-button" onClick={onSettings}>
            Settings → Shortcuts
          </button>
          .
        </p>
      </div>
    </ModalDialog>
  );
}
