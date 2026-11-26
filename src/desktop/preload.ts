import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import type { DesktopApi, FolderState, OpenFolderResult } from './bridge';
import type {
  ActionResult,
  CloneParentResult,
  CloneProgress,
  CloneResult,
  GitState,
} from './gitTypes';
import { IPC } from './ipc';

/** Subscribes to a main-to-page channel; returns the unsubscribe. */
function listen<T>(channel: string, listener: (value: T) => void) {
  const wrapped = (_event: IpcRendererEvent, value: T) => listener(value);
  ipcRenderer.on(channel, wrapped);
  return () => {
    ipcRenderer.removeListener(channel, wrapped);
  };
}

// Runs sandboxed: no Node APIs, only this narrow API reaches the page.
const api: DesktopApi = {
  platform: process.platform,
  getFolder: () => ipcRenderer.invoke(IPC.getFolder) as Promise<FolderState>,
  chooseFolder: () =>
    ipcRenderer.invoke(IPC.chooseFolder) as Promise<OpenFolderResult>,
  openRecentFolder: (folder) =>
    ipcRenderer.invoke(
      IPC.openRecentFolder,
      folder,
    ) as Promise<OpenFolderResult>,
  revealFolder: () => ipcRenderer.invoke(IPC.revealFolder) as Promise<void>,
  copyFolderPath: () => ipcRenderer.invoke(IPC.copyFolderPath) as Promise<void>,
  showFolderMenu: (point) =>
    ipcRenderer.invoke(IPC.showFolderMenu, {
      x: point.x,
      y: point.y,
    }) as Promise<void>,
  onFolderChanged: (listener) =>
    listen<FolderState>(IPC.folderChanged, listener),
  gitGetState: () => ipcRenderer.invoke(IPC.gitGetState) as Promise<GitState>,
  gitRefresh: () => ipcRenderer.invoke(IPC.gitRefresh) as Promise<GitState>,
  gitFetch: () => ipcRenderer.invoke(IPC.gitFetch) as Promise<ActionResult>,
  gitPull: () => ipcRenderer.invoke(IPC.gitPull) as Promise<ActionResult>,
  gitCancel: () => ipcRenderer.invoke(IPC.gitCancel) as Promise<void>,
  gitChooseCloneParent: () =>
    ipcRenderer.invoke(IPC.gitChooseCloneParent) as Promise<CloneParentResult>,
  gitClone: (url) =>
    ipcRenderer.invoke(IPC.gitClone, String(url)) as Promise<CloneResult>,
  gitSetAutoFetch: (minutes) =>
    ipcRenderer.invoke(
      IPC.gitSetAutoFetch,
      Number(minutes),
    ) as Promise<GitState>,
  onGitState: (listener) => listen<GitState>(IPC.gitState, listener),
  onCloneProgress: (listener) =>
    listen<CloneProgress>(IPC.gitCloneProgress, listener),
  onOpenClone: (listener) => listen<null>(IPC.gitOpenClone, () => listener()),
};

contextBridge.exposeInMainWorld('rcdDesktop', api);
