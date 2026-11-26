import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import type { CloneProgress, CloneResult } from '../desktop/gitTypes';
import {
  CLONE_HOSTS,
  SUGGESTED_CLONE_URL,
  parseCloneUrl,
} from '../desktop/gitUrl';
import { ModalDialog } from './Dialog';
import { desktop } from './desktop';

/** Clone a GitHub repository into a new folder, then open it. */
export function CloneDialog({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [parent, setParent] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<CloneProgress | null>(null);
  const [result, setResult] = useState<CloneResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    if (desktop === null) return;
    return desktop.onCloneProgress(setProgress);
  }, []);

  if (desktop === null) return null;
  const api = desktop;
  const check = parseCloneUrl(url);
  const sep = api.platform === 'win32' ? '\\' : '/';
  const target =
    parent !== null && check.ok
      ? `${parent.replace(/[\\/]+$/, '')}${sep}${check.name}`
      : null;
  const canClone = check.ok && parent !== null && !running;

  const clone = async () => {
    setRunning(true);
    setProgress(null);
    setResult(null);
    try {
      const outcome = await api.gitClone(url);
      setResult(outcome);
      // Opened: the window is reloading into the viewer
    } catch (error) {
      setResult({
        status: 'failed',
        category: 'failed',
        message: (error as Error).message,
      });
    } finally {
      setRunning(false);
    }
  };

  const close = () => {
    if (running) void api.gitCancel();
    else onClose();
  };

  return (
    <ModalDialog
      className="modal clone-dialog"
      labelledBy={`${id}-title`}
      onClose={close}
      initialFocus={inputRef}
    >
      <div className="modal-header">
        <h2 id={`${id}-title`}>Clone from GitHub</h2>
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          aria-label="Close"
          disabled={running}
          onClick={onClose}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <form
        className="modal-body clone-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (canClone) void clone();
        }}
      >
        <label className="clone-field">
          <span>Repository URL</span>
          <input
            ref={inputRef}
            className="input"
            type="text"
            spellCheck={false}
            autoComplete="off"
            placeholder={SUGGESTED_CLONE_URL}
            value={url}
            disabled={running}
            aria-invalid={url !== '' && !check.ok}
            aria-describedby={`${id}-url-help`}
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
        <p id={`${id}-url-help`} className="clone-help">
          {url === '' ? (
            <>
              https://{CLONE_HOSTS[0]}/owner/repo or git@{CLONE_HOSTS[0]}
              :owner/repo.{' '}
              <button
                type="button"
                className="link-button"
                onClick={() => setUrl(SUGGESTED_CLONE_URL)}
              >
                Use rcd-data-models
              </button>
            </>
          ) : check.ok ? (
            <span className="clone-ok">Looks right.</span>
          ) : (
            <span className="clone-invalid">{check.reason}</span>
          )}
        </p>
        <div className="clone-field">
          <span>Clone into</span>
          <div className="clone-destination">
            <code>{target ?? parent ?? 'No folder chosen'}</code>
            <button
              type="button"
              className="btn btn-sm"
              disabled={running}
              onClick={() =>
                void api.gitChooseCloneParent().then((chosen) => {
                  if (chosen.status === 'chosen') setParent(chosen.parent);
                })
              }
            >
              Choose…
            </button>
          </div>
          <p className="clone-help">
            A new folder named after the repository is created inside the folder
            you choose; an existing folder is never used.
          </p>
        </div>
        <div className="clone-status" role="status">
          {running && (
            <p className="git-running">
              <span className="spinner" aria-hidden="true" />
              {progress === null
                ? 'Starting git…'
                : `${progress.phase}${progress.percent === null ? '…' : ` ${progress.percent}%`}`}
            </p>
          )}
          {!running && result !== null && (
            <div
              className={`git-result ${result.status === 'ok' ? 'git-result-ok' : result.status === 'refused' ? 'git-result-refused' : 'git-result-failed'}`}
            >
              <p>
                {result.status === 'ok' && result.opened
                  ? `${result.message} Opening…`
                  : result.message}
              </p>
              {result.status === 'failed' && result.detail !== undefined && (
                <details>
                  <summary>Details</summary>
                  <pre className="git-detail">{result.detail}</pre>
                </details>
              )}
            </div>
          )}
        </div>
        <div className="clone-buttons">
          {running ? (
            <button
              type="button"
              className="btn"
              onClick={() => void api.gitCancel()}
            >
              Cancel clone
            </button>
          ) : (
            <button type="button" className="btn" onClick={onClose}>
              Close
            </button>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!canClone}
          >
            Clone
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
