import { X } from 'lucide-react';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

import { ModalDialog } from './Dialog';
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
export const IS_MAC = isMacPlatform(platformName());

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
        SHORTCUTS,
        pending,
        chordOf(event, IS_MAC),
        event.timeStamp,
        {
          typing: isTypingTarget(
            target?.tagName ?? '',
            target instanceof HTMLInputElement ? target.type : '',
            target?.isContentEditable ?? false,
          ),
          modalOpen: document.querySelector('dialog[open]') !== null,
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
  const latest = useRef(handler);
  useLayoutEffect(() => {
    latest.current = handler;
  });
  const bound = handler !== null;
  useEffect(() => {
    if (registry === null || !bound) return;
    return registry.bind(id, () => latest.current?.());
  }, [registry, id, bound]);
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

const GROUPS = [
  'Everywhere',
  'Doc pages',
  'Lineage graph',
  'Quick open',
  'Sidebar',
] as const;

/** Generated from the shortcut table, so it cannot fall out of date. */
export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const rows = [
    ...SHORTCUTS.map((def) => ({
      keys: def.keys,
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
                      <KeyList keys={row.keys} />
                    </dd>
                  </div>
                ))}
            </dl>
          </section>
        ))}
        <p className="muted shortcut-note">
          Shortcuts do nothing while you type in a text field, except{' '}
          <Keys chord="mod+k" />.
        </p>
      </div>
    </ModalDialog>
  );
}
