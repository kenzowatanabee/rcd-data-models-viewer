import type { DesktopApi } from '../desktop/bridge';

declare global {
  interface Window {
    /** Set by the desktop app's preload script; absent in a browser. */
    rcdDesktop?: DesktopApi;
  }
}

/** The desktop app's API, or null in a plain browser. */
export const desktop: DesktopApi | null =
  typeof window === 'object' && typeof window.rcdDesktop === 'object'
    ? window.rcdDesktop
    : null;

const FOLDER_KEY = 'rcd-desktop.folder';

/**
 * Per-tab memory (which docs were left in Markdown view) belongs to one
 * docs folder, so it is dropped when the window shows another.
 */
export function resetSessionFor(folder: string | null): void {
  try {
    const store = window.sessionStorage;
    if (store.getItem(FOLDER_KEY) === folder) return;
    store.clear();
    if (folder !== null) store.setItem(FOLDER_KEY, folder);
  } catch {
    // No session storage: nothing to reset
  }
}
