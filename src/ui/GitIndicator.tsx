import { ArrowDown, ArrowUp, GitBranch } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { AUTO_FETCH_CHOICES } from '../desktop/gitPolicy';
import type { ActionResult, GitState } from '../desktop/gitTypes';
import { useDocsVersion } from './api';
import { desktop } from './desktop';
import {
  RUNNING_TEXT,
  changesText,
  fetchAvailability,
  indicatorOf,
  pullAvailability,
  timeAgo,
} from './gitView';

/** The git state from the main process, kept current. */
function useGitState(): GitState | null {
  const [state, setState] = useState<GitState | null>(null);
  const version = useDocsVersion();
  useEffect(() => {
    if (desktop === null) return;
    let live = true;
    void desktop.gitGetState().then((next) => {
      if (live) setState(next);
    });
    const off = desktop.onGitState(setState);
    return () => {
      live = false;
      off();
    };
  }, []);
  // A saved doc changes the work tree: re-read once the edits settle
  useEffect(() => {
    if (desktop === null || version === 0) return;
    const api = desktop;
    const timer = setTimeout(() => void api.gitRefresh(), 800);
    return () => clearTimeout(timer);
  }, [version]);
  return state;
}

function ResultMessage({ result }: { result: ActionResult }) {
  const tone =
    result.status === 'ok'
      ? 'git-result-ok'
      : result.status === 'refused'
        ? 'git-result-refused'
        : 'git-result-failed';
  return (
    <div className={`git-result ${tone}`}>
      <p>{result.message}</p>
      {result.status === 'refused' && result.files !== undefined && (
        <ul className="git-files">
          {result.files.map((file) => (
            <li key={file}>
              <code>{file}</code>
            </li>
          ))}
        </ul>
      )}
      {result.status === 'failed' && result.detail !== undefined && (
        <details>
          <summary>Details</summary>
          <pre className="git-detail">{result.detail}</pre>
        </details>
      )}
    </div>
  );
}

/** Branch, ahead/behind and local changes, with Fetch and Pull. */
export function GitIndicator() {
  const state = useGitState();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    popoverRef.current?.querySelector<HTMLElement>('button, select')?.focus();
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !popoverRef.current?.contains(target) &&
        !buttonRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  if (desktop === null) return null;
  const api = desktop;
  const indicator = indicatorOf(state);
  const pull = pullAvailability(state);
  const fetch = fetchAvailability(state);
  const repo = state?.status?.status === 'ok' ? state.status.repo : null;
  const failure = state?.status?.status === 'failed' ? state.status : null;
  const running = state?.running ?? null;
  const userRunning = running === 'fetch' || running === 'pull';

  return (
    <div className="git-menu">
      <button
        ref={buttonRef}
        type="button"
        className={`git-indicator git-tone-${indicator.tone}`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-haspopup="dialog"
        aria-label={indicator.summary}
        title={indicator.summary}
        onClick={() => {
          setNow(Date.now());
          setOpen(!open);
        }}
      >
        {running !== null && running !== 'status' ? (
          <span className="spinner git-spinner" aria-hidden="true" />
        ) : (
          <GitBranch size={14} aria-hidden="true" />
        )}
        <span className="git-label">{indicator.label}</span>
        {indicator.note !== null && (
          <span className="git-note">{indicator.note}</span>
        )}
        {indicator.behind > 0 && (
          <span className="git-count tabular" aria-hidden="true">
            <ArrowDown size={12} />
            {indicator.behind}
          </span>
        )}
        {indicator.ahead > 0 && (
          <span className="git-count tabular" aria-hidden="true">
            <ArrowUp size={12} />
            {indicator.ahead}
          </span>
        )}
        {indicator.dirty && <span className="git-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div
          ref={popoverRef}
          id={id}
          className="git-popover"
          role="dialog"
          aria-label="Git"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              setOpen(false);
              buttonRef.current?.focus();
            }
          }}
          onBlur={(event) => {
            const next = event.relatedTarget as Node | null;
            if (
              next !== null &&
              !popoverRef.current?.contains(next) &&
              next !== buttonRef.current
            ) {
              setOpen(false);
            }
          }}
        >
          {state?.unavailable != null && (
            <p className="git-result git-result-failed">{state.unavailable}</p>
          )}
          {failure !== null && <ResultMessage result={failure} />}
          {repo !== null && (
            <dl className="git-facts">
              <dt>Branch</dt>
              <dd>
                <code>{repo.branch ?? `detached at ${repo.head ?? '?'}`}</code>
                {repo.upstream !== null && (
                  <>
                    {' → '}
                    <code>{repo.upstream}</code>
                    {repo.upstreamGone && ' (gone)'}
                  </>
                )}
                {repo.upstream === null &&
                  repo.branch !== null &&
                  ' (no upstream)'}
              </dd>
              {repo.ahead !== null && repo.behind !== null && (
                <>
                  <dt>Commits</dt>
                  <dd>
                    {repo.behind} to pull, {repo.ahead} not pushed
                  </dd>
                </>
              )}
              <dt>Local changes</dt>
              <dd>{changesText(repo)}</dd>
              {repo.operation !== null && (
                <>
                  <dt>In progress</dt>
                  <dd>{repo.operation}</dd>
                </>
              )}
              <dt>Last fetched</dt>
              <dd>{timeAgo(repo.lastFetch, now)}</dd>
              {repo.remote !== null && (
                <>
                  <dt>Remote</dt>
                  <dd>
                    <code className="git-remote">
                      {repo.remote.name} {repo.remote.url}
                    </code>
                  </dd>
                </>
              )}
              {repo.subfolder !== null && (
                <>
                  <dt>Work tree</dt>
                  <dd>
                    <code className="git-remote">{repo.topLevel}</code> (docs in{' '}
                    <code>{repo.subfolder}</code>)
                  </dd>
                </>
              )}
            </dl>
          )}
          {repo !== null && (
            <div className="git-actions">
              <button
                type="button"
                className="btn btn-sm"
                disabled={!fetch.enabled}
                onClick={() => void api.gitFetch()}
              >
                Fetch
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={!pull.enabled}
                aria-describedby={
                  pull.reason === null ? undefined : `${id}-why`
                }
                onClick={() => void api.gitPull()}
              >
                Pull
              </button>
              {running === 'fetch' && (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => void api.gitCancel()}
                >
                  Cancel
                </button>
              )}
            </div>
          )}
          <div className="git-live" role="status">
            {userRunning && running !== null && (
              <p className="git-running">
                <span className="spinner" aria-hidden="true" />
                {RUNNING_TEXT[running]}
              </p>
            )}
            {!userRunning && state?.last != null && (
              <ResultMessage result={state.last} />
            )}
          </div>
          {repo !== null && pull.reason !== null && !userRunning && (
            <p className="git-why" id={`${id}-why`}>
              {pull.reason}
            </p>
          )}
          {state?.backgroundProblem != null && (
            <p className="git-quiet">{state.backgroundProblem}</p>
          )}
          {repo !== null && state !== null && (
            <label className="git-auto">
              <span>Check for updates</span>
              <select
                className="select"
                value={state.autoFetchMinutes}
                onChange={(event) =>
                  void api.gitSetAutoFetch(Number(event.target.value))
                }
              >
                {AUTO_FETCH_CHOICES.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes === 0
                      ? 'Never automatically'
                      : `Every ${minutes} minutes`}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
