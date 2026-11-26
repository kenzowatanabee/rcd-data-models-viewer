import { FolderOpen, GitBranch } from 'lucide-react';
import { useState } from 'react';

import type { FolderState, OpenFolderResult } from '../desktop/bridge';
import { desktop } from './desktop';

/** The desktop app's first screen, until a docs folder is open. */
export function Welcome({
  state,
  onClone,
}: {
  state: FolderState;
  onClone: () => void;
}) {
  const [error, setError] = useState<string | null>(state.problem);
  const [busy, setBusy] = useState(false);
  if (desktop === null) return null;
  const api = desktop;

  const run = async (open: () => Promise<OpenFolderResult>) => {
    setBusy(true);
    try {
      const result = await open();
      // On success the window reloads with the viewer
      if (result.status === 'invalid') setError(result.error);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main id="main" className="welcome" tabIndex={-1}>
      <div className="state state-centred">
        <span className="state-icon">
          <FolderOpen size={20} aria-hidden="true" />
        </span>
        <h1 className="state-title">Open the data models docs</h1>
        <p>
          Choose your local clone of the <code>rcd-data-models</code> repo: the
          folder that contains <code>docs/datasets</code> and{' '}
          <code>docs/pipelines</code>. The app remembers it for next time. No
          clone yet? Clone it from GitHub here.
        </p>
        {error !== null && (
          <p className="state-detail welcome-error" role="alert">
            {error}
          </p>
        )}
        <div className="state-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void run(() => api.chooseFolder())}
          >
            Choose folder…
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={onClone}
          >
            <GitBranch size={14} aria-hidden="true" />
            Clone from GitHub…
          </button>
        </div>
        {state.recent.length > 0 && (
          <nav className="welcome-recent" aria-label="Recent folders">
            <p className="state-detail">Recent folders</p>
            <ul>
              {state.recent.map((folder) => (
                <li key={folder}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() => void run(() => api.openRecentFolder(folder))}
                  >
                    {folder}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </main>
  );
}
