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
  gitGetState: 'git:get-state',
  gitRefresh: 'git:refresh',
  gitFetch: 'git:fetch',
  gitPull: 'git:pull',
  gitCancel: 'git:cancel',
  gitChooseCloneParent: 'git:choose-clone-parent',
  gitClone: 'git:clone',
  gitSetAutoFetch: 'git:set-auto-fetch',
  gitListBranches: 'git:list-branches',
  gitSwitchBranch: 'git:switch-branch',
  /** Main to page: the menu asked for the branch picker. */
  gitOpenBranches: 'git:open-branches',
  /** Main to page: the git state changed. */
  gitState: 'git:state',
  /** Main to page: clone progress. */
  gitCloneProgress: 'git:clone-progress',
  /** Main to page: the menu asked for the clone dialog. */
  gitOpenClone: 'git:open-clone',
} as const;

import { branchNameProblem, MAX_BRANCH_NAME } from './gitBranches';
import type { BranchTarget } from './gitTypes';

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

const MAX_URL = 2048;

/** One string that may be a clone URL; `parseCloneUrl` judges it after. */
export function cloneUrlArg(args: readonly unknown[]): Parsed<string> {
  if (args.length !== 1) return null;
  const [value] = args;
  if (typeof value !== 'string' || value === '' || value.length > MAX_URL) {
    return null;
  }
  if (value.includes('\0')) return null;
  return { value };
}

/** One of the background fetch intervals offered, in minutes. */
export function minutesArg(
  args: readonly unknown[],
  choices: readonly number[],
): Parsed<number> {
  if (args.length !== 1) return null;
  const [value] = args;
  return typeof value === 'number' && choices.includes(value)
    ? { value }
    : null;
}

/**
 * `{ kind, name }` and a literal boolean: the branch to switch to (looked
 * up again in a fresh list before git sees it) and whether the user
 * confirmed leaving a commit that no branch contains.
 */
export function switchArgs(
  args: readonly unknown[],
): Parsed<{ target: BranchTarget; confirmDetached: boolean }> {
  if (args.length !== 2) return null;
  const [target, confirm] = args;
  if (confirm !== true && confirm !== false) return null;
  if (typeof target !== 'object' || target === null) return null;
  const keys = Object.keys(target).sort();
  if (keys.length !== 2 || keys[0] !== 'kind' || keys[1] !== 'name') {
    return null;
  }
  const { kind, name } = target as { kind: unknown; name: unknown };
  if (kind !== 'local' && kind !== 'remote') return null;
  if (
    typeof name !== 'string' ||
    name.length > MAX_BRANCH_NAME ||
    branchNameProblem(name) !== null
  ) {
    return null;
  }
  return { value: { target: { kind, name }, confirmDetached: confirm } };
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
