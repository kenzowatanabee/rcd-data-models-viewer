// The API the preload script exposes to the page as `window.rcdDesktop`.
// Types only, so the UI can import it without pulling in Electron.

export interface FolderState {
  /** The docs folder being shown, or null on the welcome screen. */
  current: string | null;
  /** Most recent first, the current folder included. */
  recent: string[];
  /** Why the folder asked for (remembered or on the command line) failed. */
  problem: string | null;
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
}
