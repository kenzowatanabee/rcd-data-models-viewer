import { Monitor, Moon, Plus, RotateCcw, Sun, X } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { version } from '../../package.json';
import { ModalDialog } from './Dialog';
import { desktop } from './desktop';
import { FolderActions, copyFolderPath, useFolderState } from './FolderControl';
import { AutoFetchSelect, useGitState } from './GitIndicator';
import {
  conflictsOf,
  defaultBindings,
  isDefault,
  rebind,
  refusal,
  resetOne,
  stepRecorder,
  unbind,
  type Conflict,
  type Recorder,
  type RecorderEvent,
} from './keymap';
import {
  STORAGE_KEYS,
  STORAGE_PREFIX,
  type Density,
  type GroupBy,
  type Startup,
  type ThemePreference,
} from './settings';
import {
  GROUPS,
  IS_MAC,
  Keys,
  PLATFORM,
  formatSequence,
  keymap,
  useBindings,
} from './ShortcutLayer';
import { SEQUENCE_MS, SHORTCUTS, chordOf, type ShortcutId } from './shortcuts';
import { clearSettings, readSetting, writeSetting } from './storage';
import { useTheme } from './theme';

export type SettingsSection =
  'general' | 'appearance' | 'shortcuts' | 'git' | 'about';

interface Props {
  section: SettingsSection;
  onSection: (section: SettingsSection) => void;
  onClose: () => void;
  docsPath: string | null;
  onClone: () => void;
  density: Density;
  onDensity: (density: Density) => void;
  groupBy: GroupBy;
  onGroupBy: (groupBy: GroupBy) => void;
  startup: Startup;
  onStartup: (startup: Startup) => void;
}

const SECTIONS: {
  id: SettingsSection;
  label: string;
  desktopOnly?: boolean;
}[] = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'git', label: 'Git', desktopOnly: true },
  { id: 'about', label: 'About' },
];

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: typeof Sun }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="settings-row">
      <span className="settings-label">{label}</span>
      <div className="segmented" role="group" aria-label={label}>
        {options.map(({ value: option, label: text, icon: Icon }) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
          >
            {Icon && <Icon size={14} aria-hidden="true" />}
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function General({
  docsPath,
  onClone,
  startup,
  onStartup,
}: Pick<Props, 'docsPath' | 'onClone' | 'startup' | 'onStartup'>) {
  const folders = useFolderState();
  return (
    <>
      <section className="settings-group">
        <h3>Docs folder</h3>
        <div className="settings-path">
          <code>{docsPath ?? 'Not loaded yet'}</code>
          {docsPath !== null && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => void copyFolderPath(docsPath)}
            >
              Copy path
            </button>
          )}
        </div>
        {desktop === null ? (
          <p className="settings-note">
            In the browser the folder is set on the command line,{' '}
            <code>pnpm start &lt;folder&gt;</code>; restart with another folder
            to switch. The desktop app can switch folders here.
          </p>
        ) : (
          <FolderActions folders={folders} onClone={onClone} />
        )}
      </section>
      <section className="settings-group">
        <h3>At start</h3>
        <Choice
          label="Open"
          value={startup}
          onChange={onStartup}
          options={[
            { value: 'restore', label: 'The tabs from last time' },
            { value: 'home', label: 'Home' },
          ]}
        />
        <p className="settings-note">
          Tabs are kept per docs folder. A link with an address opens in a tab
          of its own either way.
        </p>
      </section>
    </>
  );
}

function Appearance({
  density,
  onDensity,
  groupBy,
  onGroupBy,
}: Pick<Props, 'density' | 'onDensity' | 'groupBy' | 'onGroupBy'>) {
  const { preference, setPreference } = useTheme();
  const [wrap, setWrap] = useState(
    () => readSetting(STORAGE_KEYS.sourceWrap) !== 'false',
  );
  const wrapId = useId();
  return (
    <section className="settings-group">
      <Choice<ThemePreference>
        label="Theme"
        value={preference}
        onChange={setPreference}
        options={[
          { value: 'light', label: 'Light', icon: Sun },
          { value: 'dark', label: 'Dark', icon: Moon },
          { value: 'system', label: 'System', icon: Monitor },
        ]}
      />
      <Choice<Density>
        label="Rows"
        value={density}
        onChange={onDensity}
        options={[
          { value: 'comfortable', label: 'Comfortable' },
          { value: 'compact', label: 'Compact' },
        ]}
      />
      <Choice<GroupBy>
        label="Sidebar groups"
        value={groupBy}
        onChange={onGroupBy}
        options={[
          { value: 'layer', label: 'Layer' },
          { value: 'family', label: 'Family' },
          { value: 'az', label: 'A–Z' },
        ]}
      />
      <div className="settings-row">
        <label className="settings-label" htmlFor={wrapId}>
          Markdown view
        </label>
        <label className="settings-check">
          <input
            id={wrapId}
            type="checkbox"
            checked={wrap}
            onChange={(event) => {
              setWrap(event.target.checked);
              writeSetting(
                STORAGE_KEYS.sourceWrap,
                String(event.target.checked),
              );
            }}
          />
          Wrap long lines
        </label>
      </div>
    </section>
  );
}

const nameOf = (id: ShortcutId) =>
  SHORTCUTS.find((def) => def.id === id)?.label ?? id;

interface Problem {
  id: ShortcutId;
  text: string;
}

interface Clash {
  id: ShortcutId;
  index: number;
  sequence: string[];
  conflicts: Conflict[];
}

function Shortcuts() {
  const bindings = useBindings();
  const [query, setQuery] = useState('');
  const [recording, setRecording] = useState<{
    id: ShortcutId;
    index: number;
    state: Recorder;
  } | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [clash, setClash] = useState<Clash | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const recordingRef = useRef(recording);
  useLayoutEffect(() => {
    recordingRef.current = recording;
  });

  const finish = (id: ShortcutId, index: number, sequence: string[]) => {
    const current = keymap.get();
    const reason = refusal(sequence, PLATFORM);
    if (reason !== null) {
      setProblem({
        id,
        text: `${formatSequence(sequence)} can’t be used: ${reason}`,
      });
      return;
    }
    const conflicts = conflictsOf(current, id, sequence);
    if (conflicts.length > 0) {
      setClash({ id, index, sequence, conflicts });
      return;
    }
    keymap.set(rebind(current, id, index, sequence));
  };

  const dispatch = (event: RecorderEvent) => {
    const live = recordingRef.current;
    if (live === null) return;
    const step = stepRecorder(live.state, event);
    if (step.done !== null) {
      setRecording(null);
      finish(live.id, live.index, step.done);
    } else if (step.cancelled) {
      setRecording(null);
    } else {
      setRecording({ ...live, state: step.state });
    }
  };
  const dispatchRef = useRef(dispatch);
  useLayoutEffect(() => {
    dispatchRef.current = dispatch;
  });

  const listening = recording !== null;
  const waiting =
    recording?.state.phase === 'listening' &&
    recording.state.chords.length === 1;
  useEffect(() => {
    if (!listening) return;
    // Capture, ahead of the shortcut handler and the dialog's own Esc: the
    // keys being recorded must not do what they are bound to
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      dispatchRef.current({
        type: 'key',
        chord: chordOf(event, IS_MAC),
        now: event.timeStamp,
      });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listening]);
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(
      // The timer is the clock: by now the pause is long enough
      () =>
        dispatchRef.current({ type: 'timeout', now: Number.POSITIVE_INFINITY }),
      SEQUENCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [waiting]);

  const start = (id: ShortcutId, index: number) => {
    setProblem(null);
    setClash(null);
    setRecording({
      id,
      index,
      state: stepRecorder({ phase: 'idle' }, { type: 'start', now: 0 }).state,
    });
  };

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (id: ShortcutId, label: string, where: string) => {
    const text = [
      label,
      where,
      ...bindings[id].map((sequence) => formatSequence(sequence)),
    ]
      .join(' ')
      .toLowerCase();
    return words.every((word) => text.includes(word));
  };
  const allDefault = SHORTCUTS.every((def) =>
    isDefault(bindings, PLATFORM, def.id),
  );

  return (
    <section className="settings-group settings-shortcuts">
      <div className="settings-shortcuts-head">
        <input
          type="search"
          className="input"
          placeholder="Search shortcuts"
          aria-label="Search shortcuts"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {confirmReset ? (
          <span className="settings-confirm">
            Reset every shortcut?
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => {
                keymap.set(defaultBindings(PLATFORM));
                setConfirmReset(false);
                setProblem(null);
                setClash(null);
              }}
            >
              Reset all
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setConfirmReset(false)}
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="btn btn-sm"
            disabled={allDefault}
            onClick={() => setConfirmReset(true)}
          >
            <RotateCcw size={13} aria-hidden="true" />
            Reset all to defaults
          </button>
        )}
      </div>
      <p className="settings-note">
        {PLATFORM.desktop
          ? 'In the desktop app the tab shortcuts are the usual ones: Ctrl/⌘+T, W, Shift+T and Tab. The menu’s own shortcuts (Open Folder, Fetch, Pull, zoom, reload) are fixed and cannot be taken.'
          : 'In a browser, Ctrl/⌘+T, W and Tab belong to the browser, so tabs here use Alt (⌥ on a Mac) instead; the desktop app uses the usual keys.'}{' '}
        Click a key to change it, then press the new keys: one combination, or
        two plain keys for a sequence (Enter keeps a single key, Esc cancels).
      </p>
      <div className="settings-live" role="status" aria-live="polite">
        {recording !== null &&
          `Recording keys for “${nameOf(recording.id)}”: press the new keys, or Esc to cancel.`}
      </div>
      {GROUPS.filter(
        (group) => group !== 'Quick open' && group !== 'Sidebar',
      ).map((group) => {
        const defs = SHORTCUTS.filter(
          (def) => def.where === group && matches(def.id, def.label, def.where),
        );
        if (defs.length === 0) return null;
        return (
          <div key={group} className="shortcut-settings-group">
            <h3>{group}</h3>
            <ul>
              {defs.map((def) => {
                const list = bindings[def.id];
                const own = recording?.id === def.id ? recording : null;
                const clashHere = clash?.id === def.id ? clash : null;
                return (
                  <li key={def.id} className="shortcut-setting">
                    <span className="shortcut-setting-label">{def.label}</span>
                    <span className="shortcut-setting-keys">
                      {list.map((sequence, index) =>
                        own?.index === index ? (
                          <RecordingChip key={index} recorder={own.state} />
                        ) : (
                          <span key={index} className="binding">
                            <button
                              type="button"
                              className="binding-keys"
                              aria-label={`${def.label}: ${formatSequence(sequence)}. Change`}
                              title="Change"
                              onClick={() => start(def.id, index)}
                            >
                              {sequence.map((chord, at) => (
                                <span key={at} className="key-step">
                                  {at > 0 && (
                                    <span className="muted">then</span>
                                  )}
                                  <Keys chord={chord} />
                                </span>
                              ))}
                            </button>
                            <button
                              type="button"
                              className="binding-remove"
                              aria-label={`Remove ${formatSequence(sequence)} from ${def.label}`}
                              title="Remove"
                              onClick={() =>
                                keymap.set(unbind(keymap.get(), def.id, index))
                              }
                            >
                              <X size={11} aria-hidden="true" />
                            </button>
                          </span>
                        ),
                      )}
                      {own !== null && own.index >= list.length && (
                        <RecordingChip recorder={own.state} />
                      )}
                      {list.length === 0 && own === null && (
                        <span className="muted">None</span>
                      )}
                      {own === null && list.length < 4 && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon btn-sm"
                          aria-label={`Add keys for ${def.label}`}
                          title="Add keys"
                          onClick={() => start(def.id, list.length)}
                        >
                          <Plus size={13} aria-hidden="true" />
                        </button>
                      )}
                      {own !== null && (
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => setRecording(null)}
                        >
                          Cancel
                        </button>
                      )}
                      {!isDefault(bindings, PLATFORM, def.id) &&
                        own === null && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon btn-sm"
                            aria-label={`Reset ${def.label} to its default`}
                            title="Reset to the default"
                            onClick={() =>
                              keymap.set(
                                resetOne(keymap.get(), PLATFORM, def.id),
                              )
                            }
                          >
                            <RotateCcw size={13} aria-hidden="true" />
                          </button>
                        )}
                    </span>
                    {problem?.id === def.id && (
                      <p className="shortcut-problem" role="alert">
                        {problem.text}
                      </p>
                    )}
                    {clashHere !== null && (
                      <div className="shortcut-problem" role="alert">
                        <p>
                          {formatSequence(clashHere.sequence)} is already used
                          by{' '}
                          {clashHere.conflicts
                            .map((conflict) => `“${nameOf(conflict.id)}”`)
                            .join(' and ')}
                          .
                        </p>
                        <div className="shortcut-problem-actions">
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => {
                              keymap.set(
                                rebind(
                                  keymap.get(),
                                  clashHere.id,
                                  clashHere.index,
                                  clashHere.sequence,
                                  'replace',
                                ),
                              );
                              setClash(null);
                            }}
                          >
                            Replace
                          </button>
                          {list[clashHere.index] !== undefined && (
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => {
                                keymap.set(
                                  rebind(
                                    keymap.get(),
                                    clashHere.id,
                                    clashHere.index,
                                    clashHere.sequence,
                                    'swap',
                                  ),
                                );
                                setClash(null);
                              }}
                            >
                              Swap
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => setClash(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function RecordingChip({ recorder }: { recorder: Recorder }) {
  const chords = recorder.phase === 'listening' ? recorder.chords : [];
  return (
    <span className="binding is-recording">
      {chords.length === 0 ? (
        'Press keys…'
      ) : (
        <>
          <Keys chord={chords[0] ?? ''} />
          <span className="muted">then…</span>
        </>
      )}
    </span>
  );
}

function Git() {
  const state = useGitState();
  const id = useId();
  return (
    <section className="settings-group">
      <div className="settings-row">
        <label className="settings-label" htmlFor={id}>
          Check for updates
        </label>
        <AutoFetchSelect state={state} id={id} />
      </div>
      <p className="settings-note">
        A background fetch only reads from the remote; Pull is always yours to
        run, from the folder control at the bottom of the sidebar.
        {state?.unavailable != null && ` ${state.unavailable}`}
      </p>
    </section>
  );
}

function About() {
  const folders = useFolderState();
  const [confirm, setConfirm] = useState(false);
  return (
    <section className="settings-group">
      <dl className="settings-facts">
        <dt>App</dt>
        <dd>
          RCD data models viewer {version}
          {desktop !== null ? ' (desktop app)' : ' (browser)'}
        </dd>
        <dt>Settings</dt>
        <dd>
          {desktop === null ? (
            <>
              This browser’s storage for <code>{window.location.origin}</code>:
              theme, layout, tabs and shortcuts.
            </>
          ) : (
            <>
              Theme, layout, tabs and shortcuts: the app’s own storage, in its
              user data folder. Folders, window and git settings:{' '}
              <code>{folders?.settingsFile ?? 'settings.json'}</code>.
            </>
          )}
        </dd>
      </dl>
      {confirm ? (
        <div className="settings-confirm">
          Reset the theme, layout, pins, tabs of every folder and shortcuts?
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => {
              clearSettings(STORAGE_PREFIX);
              window.location.replace(
                `${window.location.pathname}${window.location.search}`,
              );
            }}
          >
            Reset and reload
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setConfirm(false)}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setConfirm(true)}
        >
          Reset all settings…
        </button>
      )}
    </section>
  );
}

/** Settings: a modal with the sections on the left. */
export function SettingsDialog(props: Props) {
  const { section, onSection, onClose } = props;
  const sections = SECTIONS.filter(
    (item) => !item.desktopOnly || desktop !== null,
  );
  const shown = sections.some((item) => item.id === section)
    ? section
    : 'general';
  const title = sections.find((item) => item.id === shown)?.label ?? '';
  return (
    <ModalDialog
      className="modal settings-dialog"
      labelledBy="settings-title"
      onClose={onClose}
      closeOnBackdrop
    >
      <div className="modal-header">
        <h2 id="settings-title">Settings</h2>
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
      <div className="settings-body">
        <nav className="settings-nav" aria-label="Settings sections">
          {sections.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={item.id === shown ? 'page' : undefined}
              onClick={() => onSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div
          className="settings-content"
          aria-labelledby="settings-section-title"
          role="region"
        >
          <h2 id="settings-section-title" className="settings-section-title">
            {title}
          </h2>
          {shown === 'general' && <General {...props} />}
          {shown === 'appearance' && <Appearance {...props} />}
          {shown === 'shortcuts' && <Shortcuts />}
          {shown === 'git' && <Git />}
          {shown === 'about' && <About />}
        </div>
      </div>
    </ModalDialog>
  );
}
