// The API the preload script exposes to the page as `window.rcdDesktop`.
// Types only, so the UI can import it without pulling in Electron.

import type {
  ActionResult,
  BranchListResult,
  BranchTarget,
  CloneParentResult,
  CloneProgress,
  CloneResult,
  GitState,
} from './gitTypes';

export interface FolderState {
  /** The docs folder being shown, or null on the welcome screen. */
  current: string | null;
  /** Most recent first, the current folder included. */
  recent: string[];
  /** Why the folder asked for (remembered or on the command line) failed. */
  problem: string | null;
  /** Where the app keeps its folders, window and git settings. */
  settingsFile?: string;
}

export type OpenFolderResult =
  | { status: 'opened' }
  | { status: 'canceled' }
  | { status: 'invalid'; error: string };

export interface DesktopApi {
  /** `process.platform` of the app: darwin, win32, linux. */
  platform: string;
  getFolder: () => Promise<FolderState>;
  /** Asks with the native folder dialog, checks the folder, then opens it. */
  chooseFolder: () => Promise<OpenFolderResult>;
  /** Opens one of `FolderState.recent`; any other path is refused. */
  openRecentFolder: (folder: string) => Promise<OpenFolderResult>;
  revealFolder: () => Promise<void>;
  copyFolderPath: () => Promise<void>;
  /** The native folder menu at a point in the window (CSS pixels). */
  showFolderMenu: (point: { x: number; y: number }) => Promise<void>;
  /** Called after another folder opened; returns an unsubscribe function. */
  onFolderChanged: (listener: (state: FolderState) => void) => () => void;

  // Git: a fixed set of operations on the open docs folder only
  gitGetState: () => Promise<GitState>;
  /** Re-reads the status (refused quietly while another operation runs). */
  gitRefresh: () => Promise<GitState>;
  gitFetch: () => Promise<ActionResult>;
  /** Fetch, then fast-forward only. */
  gitPull: () => Promise<ActionResult>;
  /** Stops a running clone or fetch. */
  gitCancel: () => Promise<void>;
  /** The native folder dialog for the folder to clone into. */
  gitChooseCloneParent: () => Promise<CloneParentResult>;
  /** Clones `url` into the chosen folder, then opens it. */
  gitClone: (url: string) => Promise<CloneResult>;
  /** Background fetch interval in minutes, 0 for off. */
  gitSetAutoFetch: (minutes: number) => Promise<GitState>;
  /** Local branches and the remote's (as of the last fetch). */
  gitListBranches: () => Promise<BranchListResult>;
  /**
   * Switches to a branch from the list; never discards anything. A commit
   * only a detached HEAD holds needs `confirmDetached`.
   */
  gitSwitchBranch: (
    target: BranchTarget,
    confirmDetached: boolean,
  ) => Promise<ActionResult>;
  onOpenBranches: (listener: () => void) => () => void;
  onGitState: (listener: (state: GitState) => void) => () => void;
  onCloneProgress: (listener: (progress: CloneProgress) => void) => () => void;
  onOpenClone: (listener: () => void) => () => void;
}
