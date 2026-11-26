import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BrowserWindow,
  Menu,
  app,
  clipboard,
  dialog,
  ipcMain,
  nativeTheme,
  screen,
  session,
  shell,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
  type WebContents,
} from 'electron';

import { checkDocsRepo } from '../server/docsRepo';
import {
  findFreePort,
  startDocsServer,
  type DocsServer,
} from '../server/docsServer';
import { appArgv, parseAppArgs } from './appArgs';
import type { FolderState, OpenFolderResult } from './bridge';
import {
  pushRecentFolder,
  readSettingsFile,
  writeSettingsFile,
  type DesktopSettings,
} from './desktopSettings';
import { createGitController } from './gitController';
import { AUTO_FETCH_CHOICES } from './gitPolicy';
import {
  IPC,
  cloneUrlArg,
  folderArg,
  minutesArg,
  isTrustedSender,
  noArgs,
  pointArg,
  type Parsed,
} from './ipc';
import {
  appMenuTemplate,
  folderMenuTemplate,
  type FolderActions,
} from './menu';
import { navigationDecision } from './urlPolicy';
import { placeWindow } from './windowBounds';

const APP_NAME = 'RCD Data Models';
const HOST = '127.0.0.1';
const SIZES = { width: 1440, height: 900, minWidth: 900, minHeight: 600 };

// The bundle sits in out/desktop/, two levels below the repo
const script = fileURLToPath(import.meta.url);
const outDir = path.dirname(script);
const projectRoot = path.resolve(outDir, '../..');
const ignoreCase =
  process.platform === 'win32' || process.platform === 'darwin';

const args = parseAppArgs(appArgv(process.argv, script));

// Set before anything reads userData: run from the repo, Electron would
// otherwise call the app "Electron" and share that folder with other apps
app.setName(APP_NAME);
app.setPath(
  'userData',
  args.userDataDir === null
    ? path.join(app.getPath('appData'), APP_NAME)
    : path.resolve(args.userDataDir),
);
const settingsFile = path.join(app.getPath('userData'), 'settings.json');

let settings: DesktopSettings = readSettingsFile(settingsFile);
let server: DocsServer | null = null;
let win: BrowserWindow | null = null;
let current: string | null = null;
let problem: string | null = null;
let stopped = false;

const git = createGitController({
  folder: () => current,
  focused: () => win !== null && !win.isDestroyed() && win.isFocused(),
  publish: (state) => {
    refreshMenu();
    if (win !== null && !win.isDestroyed()) {
      win.webContents.send(IPC.gitState, state);
    }
  },
  progress: (progress) => {
    if (win !== null && !win.isDestroyed()) {
      win.webContents.send(IPC.gitCloneProgress, progress);
    }
  },
  chooseDirectory: async () => {
    const options: OpenDialogOptions = {
      title: 'Choose the folder to clone into',
      buttonLabel: 'Choose',
      properties: ['openDirectory', 'createDirectory'],
      ...(current === null ? {} : { defaultPath: path.dirname(current) }),
    };
    const result =
      win === null
        ? await dialog.showOpenDialog(options)
        : await dialog.showOpenDialog(win, options);
    const [folder] = result.filePaths;
    return result.canceled || folder === undefined ? null : folder;
  },
  openFolder: (folder) => openFolder(folder),
  docsChanged: () => server?.refreshDocs(),
  autoFetchMinutes: () => settings.autoFetchMinutes,
  saveAutoFetchMinutes: (minutes) =>
    save({ ...settings, autoFetchMinutes: minutes }),
  hooksDir: path.join(app.getPath('userData'), 'git-empty-hooks'),
});

const appOrigin = () => (server === null ? '' : new URL(server.url).origin);

function save(next: DesktopSettings): void {
  settings = next;
  try {
    writeSettingsFile(settingsFile, settings);
  } catch (error) {
    console.error(
      `Could not save ${settingsFile}: ${(error as Error).message}`,
    );
  }
}

function folderState(): FolderState {
  return { current, recent: settings.recentFolders, problem };
}

/** A path typed on a command line is relative to where it was typed. */
function resolveTyped(folder: string, cwd: string): string {
  return path.resolve(cwd, folder);
}

function startingFolder(): void {
  if (args.folder !== null) {
    const folder = resolveTyped(
      args.folder,
      process.env.INIT_CWD ?? process.cwd(),
    );
    problem = checkDocsRepo(folder);
    if (problem === null) {
      current = folder;
      save({
        ...settings,
        docsPath: folder,
        recentFolders: pushRecentFolder(
          settings.recentFolders,
          folder,
          ignoreCase,
        ),
      });
    }
    return;
  }
  if (settings.docsPath === null) return;
  const failure = checkDocsRepo(settings.docsPath);
  if (failure === null) current = settings.docsPath;
  else
    problem = `The folder used last time can no longer be opened. ${failure}`;
}

function updateTitle(): void {
  win?.setTitle(
    current === null ? APP_NAME : `${path.basename(current)} – ${APP_NAME}`,
  );
}

/** Switches the server to `folder` and reloads the page from scratch. */
async function openFolder(folder: string): Promise<OpenFolderResult> {
  const failure = checkDocsRepo(folder);
  if (failure !== null) return { status: 'invalid', error: failure };
  current = folder;
  problem = null;
  server?.setRepo(folder);
  git.folderChanged();
  save({
    ...settings,
    docsPath: folder,
    recentFolders: pushRecentFolder(settings.recentFolders, folder, ignoreCase),
  });
  refreshMenu();
  updateTitle();
  if (win !== null && server !== null) {
    const contents = win.webContents;
    contents.send(IPC.folderChanged, folderState());
    // A new page with no history: no graph, selection or scroll position
    // from the previous folder survives
    await contents.loadURL(`${server.url}/`);
    contents.navigationHistory.clear();
  }
  return { status: 'opened' };
}

async function chooseFolder(): Promise<OpenFolderResult> {
  const options: OpenDialogOptions = {
    title: 'Choose the rcd-data-models folder',
    buttonLabel: 'Open',
    properties: ['openDirectory'],
    ...(current === null ? {} : { defaultPath: path.dirname(current) }),
  };
  const result =
    win === null
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(win, options);
  const [folder] = result.filePaths;
  if (result.canceled || folder === undefined) return { status: 'canceled' };
  return openFolder(folder);
}

/** From the app menu: no page waits for the result, so problems go to a box. */
function chooseFromMenu(): void {
  void chooseFolder().then((result) => {
    if (result.status === 'invalid') {
      void dialog.showMessageBox({
        type: 'warning',
        message: 'This is not the data models repo',
        detail: result.error,
      });
    }
  });
}

function openRecent(folder: string): Promise<OpenFolderResult> {
  if (!settings.recentFolders.includes(folder)) {
    return Promise.resolve({ status: 'invalid', error: 'Not a recent folder' });
  }
  return openFolder(folder);
}

function folderActions(): FolderActions {
  return {
    platform: process.platform,
    current,
    recent: settings.recentFolders,
    openFolder: chooseFromMenu,
    openRecent: (folder) =>
      void openRecent(folder).then((result) => {
        if (result.status === 'invalid') {
          void dialog.showMessageBox({
            type: 'warning',
            message: 'That folder can no longer be opened',
            detail: result.error,
          });
        }
      }),
    reveal: () => {
      if (current !== null) shell.showItemInFolder(current);
    },
    copyPath: () => {
      if (current !== null) clipboard.writeText(current);
    },
    git: {
      canFetch: git.canFetch(),
      canPull: git.canPull(),
      // Results land in the git state, which the top bar's popover shows
      fetch: () => void git.fetch(),
      pull: () => void git.pull(),
      clone: () => {
        focusWindow();
        win?.webContents.send(IPC.gitOpenClone, null);
      },
    },
  };
}

function refreshMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(appMenuTemplate(APP_NAME, folderActions())),
  );
}

function trusted(event: IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame;
  return (
    win !== null &&
    frame !== null &&
    event.sender === win.webContents &&
    isTrustedSender(frame.url, frame === event.sender.mainFrame, appOrigin())
  );
}

/** Registers a command: the sender and the arguments are checked first. */
function handle<T, R>(
  channel: string,
  parse: (args: readonly unknown[]) => Parsed<T>,
  run: (value: T) => R | Promise<R>,
): void {
  ipcMain.handle(channel, (event, ...rawArgs: unknown[]) => {
    if (!trusted(event)) throw new Error(`${channel}: sender not allowed`);
    const parsed = parse(rawArgs);
    if (parsed === null) throw new Error(`${channel}: bad arguments`);
    return run(parsed.value);
  });
}

function registerIpc(): void {
  handle(IPC.getFolder, noArgs, folderState);
  handle(IPC.chooseFolder, noArgs, chooseFolder);
  handle(IPC.openRecentFolder, folderArg, openRecent);
  handle(IPC.revealFolder, noArgs, () => folderActions().reveal());
  handle(IPC.copyFolderPath, noArgs, () => folderActions().copyPath());
  handle(IPC.gitGetState, noArgs, () => git.state());
  handle(IPC.gitRefresh, noArgs, () => git.refresh());
  handle(IPC.gitFetch, noArgs, () => git.fetch());
  handle(IPC.gitPull, noArgs, () => git.pull());
  handle(IPC.gitCancel, noArgs, () => git.cancel());
  handle(IPC.gitChooseCloneParent, noArgs, () => git.chooseCloneParent());
  handle(IPC.gitClone, cloneUrlArg, (url) => git.clone(url));
  handle(
    IPC.gitSetAutoFetch,
    (raw) => minutesArg(raw, AUTO_FETCH_CHOICES),
    (minutes) => git.setAutoFetch(minutes),
  );
  handle(IPC.showFolderMenu, pointArg, (point) => {
    if (win === null) return;
    Menu.buildFromTemplate(folderMenuTemplate(folderActions())).popup({
      window: win,
      x: point.x,
      y: point.y,
    });
  });
}

/** Navigation stays on the app's origin; web links go to the OS browser. */
function lockDown(contents: WebContents): void {
  const guard = (event: { preventDefault: () => void }, url: string) => {
    const decision = navigationDecision(url, appOrigin());
    if (decision.action === 'allow') return;
    event.preventDefault();
    if (decision.action === 'external') void shell.openExternal(decision.url);
  };
  contents.on('will-navigate', guard);
  contents.on('will-redirect', guard);
  // The viewer never needs a second window: web links go to the browser,
  // everything else (app URLs included) is refused
  contents.setWindowOpenHandler(({ url }) => {
    const decision = navigationDecision(url, appOrigin());
    if (decision.action === 'external') void shell.openExternal(decision.url);
    return { action: 'deny' };
  });
}

function saveWindow(): void {
  if (win === null || win.isDestroyed()) return;
  save({
    ...settings,
    window: { ...win.getNormalBounds(), maximized: win.isMaximized() },
  });
}

function createWindow(): void {
  if (server === null) return;
  const placement = placeWindow(
    settings.window,
    screen.getAllDisplays().map((display) => display.workArea),
    SIZES,
  );
  win = new BrowserWindow({
    ...placement,
    minWidth: SIZES.minWidth,
    minHeight: SIZES.minHeight,
    title: APP_NAME,
    show: false,
    // The page's background, so opening does not flash white in dark mode
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16181c' : '#ffffff',
    webPreferences: {
      preload: path.join(outDir, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
    },
  });
  lockDown(win.webContents);
  if (settings.window?.maximized === true) win.maximize();
  // The page's <title> is generic; the window names the folder instead
  win.on('page-title-updated', (event) => event.preventDefault());
  updateTitle();
  win.once('ready-to-show', () => win?.show());
  // Commits made in another tool show up when the user comes back
  win.on('focus', () => void git.onFocus());
  win.on('close', saveWindow);
  win.on('closed', () => {
    win = null;
  });
  void win.loadURL(`${server.url}/`);
}

function focusWindow(): void {
  if (win === null) {
    createWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

async function main(): Promise<void> {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.on('second-instance', (_event, argv, workingDirectory) => {
    const again = parseAppArgs(appArgv(argv, script));
    focusWindow();
    if (again.folder !== null) {
      void openFolder(resolveTyped(again.folder, workingDirectory)).then(
        (result) => {
          if (result.status === 'invalid') {
            void dialog.showMessageBox({
              type: 'warning',
              message: 'That folder could not be opened',
              detail: result.error,
            });
          }
        },
      );
    }
  });
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });

  await app.whenReady();
  // The viewer needs no camera, location, notifications...; writing to the
  // clipboard (its copy buttons) is the one thing it asks for
  const allowed = (permission: string, origin: string) =>
    permission === 'clipboard-sanitized-write' && origin === appOrigin();
  session.defaultSession.setPermissionRequestHandler(
    (_contents, permission, callback, details) =>
      callback(allowed(permission, new URL(details.requestingUrl).origin)),
  );
  session.defaultSession.setPermissionCheckHandler(
    (_contents, permission, origin) => allowed(permission, origin),
  );

  startingFolder();
  const port = await findFreePort(HOST, settings.port);
  server = await startDocsServer({
    uiRoot: path.join(projectRoot, 'src/ui'),
    repo: current,
    host: HOST,
    port,
    csp: true,
    quiet: true,
  });
  if (settings.port !== server.port) save({ ...settings, port: server.port });
  console.log(`${APP_NAME}: serving ${server.url}`);

  registerIpc();
  refreshMenu();
  createWindow();
  await git.init();

  app.on('activate', () => {
    if (win === null) createWindow();
  });
}

// macOS keeps the app in the Dock with no window; elsewhere closing quits
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (event) => {
  saveWindow();
  git.dispose();
  if (server === null || stopped) return;
  event.preventDefault();
  stopped = true;
  void server.close().finally(() => app.quit());
});

main().catch((error: unknown) => {
  dialog.showErrorBox(
    APP_NAME,
    error instanceof Error ? error.message : String(error),
  );
  app.exit(1);
});
