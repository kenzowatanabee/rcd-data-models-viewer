import type { MenuItemConstructorOptions } from 'electron';

export interface FolderActions {
  platform: string;
  current: string | null;
  recent: readonly string[];
  openFolder: () => void;
  openRecent: (folder: string) => void;
  reveal: () => void;
  copyPath: () => void;
  git: GitMenuActions;
}

export interface GitMenuActions {
  /** Fetch is possible now: a repo with a remote, nothing running. */
  canFetch: boolean;
  /** Pull would fast-forward (the same rule as the popover's button). */
  canPull: boolean;
  fetch: () => void;
  pull: () => void;
  clone: () => void;
}

/** Mod+Shift: the viewer's own keys are unmodified letters and mod+K. */
export const GIT_ACCELERATORS = {
  fetch: 'CmdOrCtrl+Shift+F',
  pull: 'CmdOrCtrl+Shift+P',
} as const;

export function revealLabel(platform: string): string {
  if (platform === 'darwin') return 'Reveal in Finder';
  if (platform === 'win32') return 'Show in File Explorer';
  return 'Show in File Manager';
}

function recentItems(actions: FolderActions): MenuItemConstructorOptions[] {
  if (actions.recent.length === 0) {
    return [{ label: 'No recent folders', enabled: false }];
  }
  return actions.recent.map((folder) => ({
    label: folder,
    type: 'checkbox',
    checked: folder === actions.current,
    click: () => actions.openRecent(folder),
  }));
}

/** The menu behind the folder button in the top bar. */
export function folderMenuTemplate(
  actions: FolderActions,
): MenuItemConstructorOptions[] {
  const hasFolder = actions.current !== null;
  return [
    { label: 'Open Another Folder…', click: actions.openFolder },
    { label: 'Clone Repository…', click: actions.git.clone },
    { type: 'separator' },
    { label: 'Recent Folders', enabled: false },
    ...recentItems(actions),
    { type: 'separator' },
    {
      label: revealLabel(actions.platform),
      enabled: hasFolder,
      click: actions.reveal,
    },
    { label: 'Copy Path', enabled: hasFolder, click: actions.copyPath },
  ];
}

/**
 * The application menu. Only modified shortcuts appear here; the viewer's
 * own keys (mod+K, /, [, ], g sequences, j, k, m, t, f, 0, ?, Alt+arrows)
 * stay with the page. Git uses mod+Shift+F and mod+Shift+P.
 */
export function appMenuTemplate(
  appName: string,
  actions: FolderActions,
): MenuItemConstructorOptions[] {
  const mac = actions.platform === 'darwin';
  const hasFolder = actions.current !== null;
  const appMenu: MenuItemConstructorOptions[] = mac
    ? [
        {
          label: appName,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        },
      ]
    : [];
  return [
    ...appMenu,
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder…',
          accelerator: 'CmdOrCtrl+O',
          click: actions.openFolder,
        },
        { label: 'Open Recent', submenu: recentItems(actions) },
        { label: 'Clone Repository…', click: actions.git.clone },
        { type: 'separator' },
        {
          label: `${revealLabel(actions.platform)}`,
          enabled: hasFolder,
          click: actions.reveal,
        },
        {
          label: 'Copy Docs Folder Path',
          enabled: hasFolder,
          click: actions.copyPath,
        },
        { type: 'separator' },
        mac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Repository',
      submenu: [
        {
          label: 'Fetch',
          accelerator: GIT_ACCELERATORS.fetch,
          enabled: actions.git.canFetch,
          click: actions.git.fetch,
        },
        {
          label: 'Pull (Fast-Forward Only)',
          accelerator: GIT_ACCELERATORS.pull,
          enabled: actions.git.canPull,
          click: actions.git.pull,
        },
        { type: 'separator' },
        { label: 'Clone Repository…', click: actions.git.clone },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: mac ? [] : [{ role: 'about' }],
    },
  ];
}
