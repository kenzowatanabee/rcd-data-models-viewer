import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import type { DesktopApi, FolderState, OpenFolderResult } from './bridge';
import { IPC } from './ipc';

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
  onFolderChanged: (listener) => {
    const wrapped = (_event: IpcRendererEvent, state: FolderState) =>
      listener(state);
    ipcRenderer.on(IPC.folderChanged, wrapped);
    return () => {
      ipcRenderer.removeListener(IPC.folderChanged, wrapped);
    };
  },
};

contextBridge.exposeInMainWorld('rcdDesktop', api);
