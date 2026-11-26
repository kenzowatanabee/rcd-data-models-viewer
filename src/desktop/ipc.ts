// Channel names and argument checks shared by the main process and the
// preload. No Node or Electron imports: the preload runs sandboxed. To add a
// command: a channel here, a parser, a handler in main.ts (registered with
// `handle`), a method in bridge.ts and preload.ts.

export const IPC = {
  getFolder: 'folder:get',
  chooseFolder: 'folder:choose',
  openRecentFolder: 'folder:open-recent',
  revealFolder: 'folder:reveal',
  copyFolderPath: 'folder:copy-path',
  showFolderMenu: 'folder:menu',
  /** Main to page: another folder opened. */
  folderChanged: 'folder:changed',
} as const;

/** A parsed argument list, or null when it must be refused. */
export type Parsed<T> = { value: T } | null;

export const noArgs = (args: readonly unknown[]): Parsed<null> =>
  args.length === 0 ? { value: null } : null;

const MAX_PATH = 4096;

/** One plain string that could be a path. */
export function folderArg(args: readonly unknown[]): Parsed<string> {
  if (args.length !== 1) return null;
  const [value] = args;
  if (typeof value !== 'string' || value === '' || value.length > MAX_PATH) {
    return null;
  }
  if (value.includes('\0')) return null;
  return { value };
}

/** One `{ x, y }` with finite coordinates inside a sane window. */
export function pointArg(
  args: readonly unknown[],
): Parsed<{ x: number; y: number }> {
  if (args.length !== 1) return null;
  const [value] = args;
  if (typeof value !== 'object' || value === null) return null;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes('x') || !keys.includes('y')) {
    return null;
  }
  const { x, y } = value as { x: unknown; y: unknown };
  const ok = (n: unknown): n is number =>
    typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100_000;
  return ok(x) && ok(y)
    ? { value: { x: Math.round(x), y: Math.round(y) } }
    : null;
}

/** Only the app window's top frame, showing the app's own origin, may ask. */
export function isTrustedSender(
  frameUrl: string | null | undefined,
  isTopFrame: boolean,
  appOrigin: string,
): boolean {
  if (!isTopFrame || typeof frameUrl !== 'string') return false;
  try {
    return new URL(frameUrl).origin === appOrigin;
  } catch {
    return false;
  }
}
