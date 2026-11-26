import { Check, Folder } from 'lucide-react';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';

import type { FolderState } from '../desktop/bridge';
import { revealLabel } from '../desktop/menu';
import { desktop } from './desktop';
import {
  GitPanel,
  GitSummary,
  gitSummaryText,
  useGitState,
} from './GitIndicator';
import { folderName } from './settings';

/** The desktop app's folder list, read when needed. */
export function useFolderState(): FolderState | null {
  const [state, setState] = useState<FolderState | null>(null);
  useEffect(() => {
    if (desktop === null) return;
    let live = true;
    void desktop.getFolder().then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, []);
  return state;
}

export async function copyFolderPath(path: string) {
  if (desktop !== null) return desktop.copyFolderPath();
  await navigator.clipboard.writeText(path).catch(() => undefined);
}

/** Open another, recent folders, clone, reveal: the desktop app's actions. */
export function FolderActions({
  folders,
  onClone,
  onDone,
}: {
  folders: FolderState | null;
  onClone: () => void;
  onDone?: () => void;
}) {
  if (desktop === null) return null;
  const api = desktop;
  const recent = folders?.recent ?? [];
  return (
    <>
      <div className="folder-actions">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            onDone?.();
            void api.chooseFolder();
          }}
        >
          Open another folder…
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            onDone?.();
            onClone();
          }}
        >
          Clone…
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => void api.revealFolder()}
        >
          {revealLabel(api.platform)}
        </button>
      </div>
      {recent.length > 1 && (
        <div className="folder-recent">
          <h3>Recent folders</h3>
          <ul>
            {recent.map((path) => {
              const current = path === folders?.current;
              return (
                <li key={path}>
                  <button
                    type="button"
                    className="folder-recent-item"
                    aria-current={current ? 'true' : undefined}
                    disabled={current}
                    title={path}
                    onClick={() => void api.openRecentFolder(path)}
                  >
                    {current ? (
                      <Check size={13} aria-hidden="true" />
                    ) : (
                      <Folder size={13} aria-hidden="true" />
                    )}
                    <span className="folder-recent-name">
                      {folderName(path)}
                    </span>
                    <span className="folder-recent-path">{path}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

interface Props {
  docsPath: string | null;
  /** `rail`: an icon button whose popover opens to the right. */
  placement: 'sidebar' | 'rail';
  onClone: () => void;
}

/**
 * The docs folder, with the git summary in the desktop app; its popover has
 * the git details, Fetch and Pull, and the folder actions.
 */
export function FolderControl({ docsPath, placement, onClone }: Props) {
  const git = useGitState();
  const folders = useFolderState();
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<CSSProperties>({});
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

  if (docsPath === null) return null;
  const name = folderName(docsPath);
  const summary = desktop === null ? '' : `, ${gitSummaryText(git)}`;
  return (
    <div className={`folder-control folder-control-${placement}`}>
      <button
        ref={buttonRef}
        type="button"
        className={placement === 'rail' ? 'rail-button' : 'folder-button'}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-haspopup="dialog"
        aria-label={`Docs folder: ${name}${summary}`}
        title={`${docsPath}${summary}`}
        onClick={(event) => {
          // Fixed, so the sidebar's edge does not clip it: above the button
          // in the sidebar, beside it on the rail
          const box = event.currentTarget.getBoundingClientRect();
          setPlace(
            placement === 'rail'
              ? { left: box.right + 8, bottom: window.innerHeight - box.bottom }
              : { left: box.left, bottom: window.innerHeight - box.top + 6 },
          );
          setOpen(!open);
        }}
      >
        <Folder size={placement === 'rail' ? 18 : 14} aria-hidden="true" />
        {placement === 'sidebar' && (
          <>
            <span className="folder-name">{name}</span>
            {desktop !== null && <GitSummary state={git} />}
          </>
        )}
      </button>
      {open && (
        <div
          ref={popoverRef}
          id={id}
          className="git-popover folder-popover"
          style={place}
          role="dialog"
          aria-label="Docs folder"
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
          <div className="folder-head">
            <Folder size={15} aria-hidden="true" />
            <div className="folder-head-text">
              <strong>{name}</strong>
              <code className="git-remote">{docsPath}</code>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => void copyFolderPath(docsPath)}
            >
              Copy path
            </button>
          </div>
          {desktop === null ? (
            <p className="git-quiet">
              The folder is set on the command line (
              <code>pnpm start &lt;folder&gt;</code>); restart with another
              folder to switch.
            </p>
          ) : (
            <>
              <GitPanel state={git} />
              <FolderActions
                folders={folders}
                onClone={onClone}
                onDone={() => setOpen(false)}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
