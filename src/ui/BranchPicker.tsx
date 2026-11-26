import { ArrowDown, ArrowUp, Check, GitBranch, Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  ActionResult,
  BranchInfo,
  BranchListResult,
  BranchTarget,
} from '../desktop/gitTypes';
import { branchGroups, branchLabel, branchNotes } from './branchView';
import { desktop } from './desktop';
import { ModalDialog } from './Dialog';
import { ResultMessage } from './GitIndicator';
import { timeAgo } from './gitView';
import { nextIndex } from './settings';

interface Props {
  onClose: () => void;
  /** Switch to this one right away (chosen in quick open). */
  initialTarget?: BranchTarget | null;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'switching'; target: BranchTarget }
  | { kind: 'confirm'; target: BranchTarget; message: string }
  | { kind: 'fetching' };

const optionId = (index: number) => `branch-option-${index}`;

/** The desktop app's branch list: filter, pick, switch. */
export function BranchPicker({ onClose, initialTarget = null }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [list, setList] = useState<BranchListResult | null>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [phase, setPhase] = useState<Phase>(() =>
    initialTarget === null
      ? { kind: 'idle' }
      : { kind: 'switching', target: initialTarget },
  );
  const [result, setResult] = useState<ActionResult | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const showList = useCallback((next: BranchListResult) => {
    setList(next);
    setNow(Date.now());
  }, []);
  const load = useCallback(async () => {
    if (desktop === null) return;
    showList(await desktop.gitListBranches());
  }, [showList]);

  // What git answered to a switch; called once the answer is in
  const settle = useCallback(
    (target: BranchTarget, outcome: ActionResult) => {
      if (
        outcome.status === 'refused' &&
        outcome.reason === 'unreachable-head'
      ) {
        setPhase({ kind: 'confirm', target, message: outcome.message });
        return;
      }
      setResult(outcome);
      setPhase({ kind: 'idle' });
      setActive(0);
      inputRef.current?.focus();
      void load();
    },
    [load],
  );
  const switchTo = (target: BranchTarget, confirmDetached: boolean) => {
    if (desktop === null) return;
    setPhase({ kind: 'switching', target });
    setResult(null);
    void desktop
      .gitSwitchBranch(target, confirmDetached)
      .then((outcome) => settle(target, outcome));
  };

  useEffect(() => {
    if (desktop === null) return;
    if (initialTarget === null) {
      void desktop.gitListBranches().then(showList);
      return;
    }
    void desktop
      .gitSwitchBranch(initialTarget, false)
      .then((outcome) => settle(initialTarget, outcome));
    // Once, when the picker opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (desktop === null) return null;
  const api = desktop;
  const ok = list?.status === 'ok' ? list.list : null;
  const groups = ok === null ? [] : branchGroups(ok, query);
  const rows = groups.flatMap((group) => group.branches);
  const current = Math.min(active, rows.length - 1);
  const busy = phase.kind === 'switching' || phase.kind === 'fetching';

  const pick = (branch: BranchInfo | undefined) => {
    if (branch === undefined || busy || branch.current) return;
    switchTo({ kind: branch.kind, name: branch.name }, false);
  };

  const fetchNow = async () => {
    setPhase({ kind: 'fetching' });
    setResult(null);
    const outcome = await api.gitFetch();
    if (outcome.status !== 'ok') setResult(outcome);
    setPhase({ kind: 'idle' });
    await load();
  };

  const offsets = groups.map((_, at) =>
    groups.slice(0, at).reduce((sum, group) => sum + group.branches.length, 0),
  );
  return (
    <ModalDialog
      className="modal palette branch-picker"
      label="Switch branch"
      onClose={onClose}
      closeOnBackdrop
      initialFocus={inputRef}
    >
      <div className="palette-search">
        <Search size={16} aria-hidden="true" />
        <input
          ref={inputRef}
          className="palette-input"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="branch-list"
          aria-autocomplete="list"
          aria-activedescendant={
            rows.length > 0 ? optionId(current) : undefined
          }
          aria-label="Filter branches"
          placeholder="Filter branches"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Enter') {
              event.preventDefault();
              pick(rows[current]);
            } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              const next = nextIndex(current, rows.length, event.key);
              if (next !== null) {
                event.preventDefault();
                setActive(next);
              }
            }
          }}
        />
        <kbd className="palette-esc">Esc</kbd>
      </div>
      <div className="branch-status" role="status">
        {phase.kind === 'switching' && (
          <p className="git-running">
            <span className="spinner" aria-hidden="true" />
            Switching to {phase.target.name}…
          </p>
        )}
        {phase.kind === 'fetching' && (
          <p className="git-running">
            <span className="spinner" aria-hidden="true" />
            Fetching…
          </p>
        )}
        {result !== null && <ResultMessage result={result} />}
        {list?.status === 'failed' && <ResultMessage result={list} />}
      </div>
      {phase.kind === 'confirm' && (
        <div className="git-result git-result-refused branch-confirm">
          <p>{phase.message}</p>
          <div className="git-actions">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => switchTo(phase.target, true)}
            >
              Switch anyway
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setPhase({ kind: 'idle' });
                void load();
                inputRef.current?.focus();
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <div
        id="branch-list"
        className="palette-list"
        role="listbox"
        aria-label="Branches"
      >
        {groups.map((group, groupIndex) => (
          <div
            key={group.id}
            role="group"
            aria-labelledby={`branch-group-${group.id}`}
            className="palette-group"
          >
            <div
              id={`branch-group-${group.id}`}
              className="palette-group-title"
              role="presentation"
            >
              {group.title}
            </div>
            {group.branches.map((branch, rowIndex) => {
              const at = (offsets[groupIndex] ?? 0) + rowIndex;
              const when = timeAgo(branch.date, now);
              return (
                <div
                  key={`${branch.kind}:${branch.name}`}
                  id={optionId(at)}
                  role="option"
                  aria-selected={at === current}
                  aria-disabled={branch.current || busy ? true : undefined}
                  aria-label={branchLabel(branch, when)}
                  title={branch.name}
                  className={`palette-option branch-option${branch.current ? ' branch-current' : ''}`}
                  onMouseMove={() => {
                    if (at !== current) setActive(at);
                  }}
                  // Keeps focus in the filter box
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(branch)}
                >
                  <span className="palette-icon">
                    {branch.current ? (
                      <Check size={13} aria-hidden="true" />
                    ) : (
                      <GitBranch size={13} aria-hidden="true" />
                    )}
                  </span>
                  <span className="palette-text">
                    <span className="branch-name">{branch.name}</span>
                    <span className="branch-meta">
                      {branchNotes(branch).map((note) => (
                        <span key={note} className="branch-note">
                          {note}
                        </span>
                      ))}
                      {branch.subject !== '' && (
                        <span className="branch-subject">{branch.subject}</span>
                      )}
                    </span>
                  </span>
                  {(branch.behind ?? 0) > 0 && (
                    <span className="git-count tabular" aria-hidden="true">
                      <ArrowDown size={12} />
                      {branch.behind}
                    </span>
                  )}
                  {(branch.ahead ?? 0) > 0 && (
                    <span className="git-count tabular" aria-hidden="true">
                      <ArrowUp size={12} />
                      {branch.ahead}
                    </span>
                  )}
                  <span className="palette-meta">{when}</span>
                </div>
              );
            })}
          </div>
        ))}
        {ok !== null && rows.length === 0 && (
          <div className="palette-empty">
            {query.trim() === '' ? (
              <p>No branches yet.</p>
            ) : (
              <p>
                No branch matches <strong>{query.trim()}</strong>.
                {ok.remote !== null && ' Fetch to see new branches.'}
              </p>
            )}
          </div>
        )}
        {list === null && phase.kind === 'idle' && (
          <p className="palette-empty">Loading branches…</p>
        )}
      </div>
      {ok !== null && (
        <div className="branch-foot">
          <span>
            {ok.remote === null
              ? 'This repository has no remote.'
              : `Branches on ${ok.remote} as of the last fetch (${timeAgo(ok.lastFetch, now)}).`}
            {ok.truncated &&
              ` Showing the ${ok.branches.length} most recent branches.`}
          </span>
          {ok.remote !== null && (
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy}
              onClick={() => void fetchNow()}
            >
              Fetch
            </button>
          )}
        </div>
      )}
    </ModalDialog>
  );
}
