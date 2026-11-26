// Git results shared by the main process and the page. Types only: plain,
// serialisable objects, so they cross IPC unchanged.

export type GitOperation =
  'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'bisect';

export interface RepoStatus {
  /** The work tree's top folder. */
  topLevel: string;
  /** The docs folder relative to `topLevel` ("docs/"), or null when equal. */
  subfolder: string | null;
  /** Null on a detached HEAD. */
  branch: string | null;
  /** Abbreviated commit id of HEAD, or null before the first commit. */
  head: string | null;
  /** Such as `origin/main`; null when the branch tracks nothing. */
  upstream: string | null;
  /** True when the branch tracks an upstream that no longer exists. */
  upstreamGone: boolean;
  /** Against the upstream as last fetched; null without one. */
  ahead: number | null;
  behind: number | null;
  /** Counts only: the app never reads or shows file contents. */
  changes: { modified: number; untracked: number; conflicted: number };
  operation: GitOperation | null;
  /** Another git process holds `index.lock`. */
  locked: boolean;
  /** When the repo was last fetched (by anything), in ms since the epoch. */
  lastFetch: number | null;
  /** The remote that Fetch and Pull use, its URL without credentials. */
  remote: { name: string; url: string } | null;
}

/** Why git could not do what was asked. */
export type GitFailure =
  | 'git-missing'
  | 'not-repo'
  | 'unsafe-directory'
  | 'unsafe-config'
  | 'locked'
  | 'offline'
  | 'auth'
  | 'not-found'
  | 'non-fast-forward'
  | 'timeout'
  | 'canceled'
  | 'failed';

/** Why the app would not run an operation; nothing was changed. */
export type GitRefusal =
  | 'busy'
  | 'no-folder'
  | 'no-remote'
  | 'detached'
  | 'no-upstream'
  | 'in-progress'
  | 'locked'
  | 'ahead'
  | 'diverged'
  | 'would-overwrite'
  | 'invalid-url'
  | 'no-destination'
  | 'destination-exists'
  | 'invalid-branch'
  | 'no-branch'
  | 'already-current'
  | 'unreachable-head';

export interface GitFailed {
  status: 'failed';
  category: GitFailure;
  /** Plain words, with what to do next. */
  message: string;
  /** git's own output, credentials removed and shortened. */
  detail?: string;
}

export interface GitRefused {
  status: 'refused';
  reason: GitRefusal;
  message: string;
  /** For `would-overwrite`: the local files in the way. */
  files?: string[];
}

export type StatusResult = { status: 'ok'; repo: RepoStatus } | GitFailed;

export type ActionResult =
  | {
      status: 'ok';
      action: 'fetch' | 'pull' | 'switch';
      message: string;
      /** Switch only: the branch before (null when detached) and after. */
      previous?: string | null;
      branch?: string;
      /** Switch only: a local tracking branch was created. */
      created?: boolean;
      /** Switch only: uncommitted changes carried over to the new branch. */
      localEdits?: number;
      /** Pull only: commits and files brought in, and the new HEAD. */
      commits?: number;
      files?: number;
      head?: string;
      /** Pull only: uncommitted local edits were left as they were. */
      keptLocalEdits?: boolean;
    }
  | GitRefused
  | GitFailed;

export type CloneResult =
  | { status: 'ok'; folder: string; opened: boolean; message: string }
  | GitRefused
  | GitFailed;

export interface CloneProgress {
  /** git's phase, such as "Receiving objects". */
  phase: string;
  percent: number | null;
}

export type GitTask =
  'status' | 'fetch' | 'pull' | 'clone' | 'branches' | 'switch';

/** One branch in the picker. */
export interface BranchInfo {
  /** `remote`: a branch on the current remote that no local branch tracks. */
  kind: 'local' | 'remote';
  /** Without `refs/heads/` or `<remote>/`, such as `docs/some-change`. */
  name: string;
  current: boolean;
  /** Local only: such as `origin/main`, or null when it tracks nothing. */
  upstream: string | null;
  upstreamGone: boolean;
  /** Local only, against the upstream as last fetched. */
  ahead: number | null;
  behind: number | null;
  /** Last commit time in ms since the epoch, and its subject (shortened). */
  date: number | null;
  subject: string;
  /** Remote only: a local branch of the same name exists (tracking something else or nothing). */
  localExists: boolean;
}

export interface BranchList {
  /** The remote whose branches are listed, or null when there is none. */
  remote: string | null;
  branches: BranchInfo[];
  /** More branches exist than are listed. */
  truncated: boolean;
  /** Remote branches are as of this fetch (ms since the epoch). */
  lastFetch: number | null;
  /** Null on a detached HEAD. */
  current: string | null;
}

export type BranchListResult = { status: 'ok'; list: BranchList } | GitFailed;

/** What the page asks to switch to; the main process looks it up again. */
export interface BranchTarget {
  kind: 'local' | 'remote';
  name: string;
}

/** Everything the page shows about git, pushed on every change. */
export interface GitState {
  /** Null when git was found; else why git features are off. */
  unavailable: string | null;
  /** The latest status of the open docs folder; null before the first. */
  status: StatusResult | null;
  running: GitTask | null;
  /** The result of the last Fetch or Pull the user asked for. */
  last: ActionResult | null;
  /** Background fetch: minutes between checks, 0 for off. */
  autoFetchMinutes: number;
  /** A quiet note when the last background fetch failed. */
  backgroundProblem: string | null;
}

export type CloneParentResult =
  { status: 'chosen'; parent: string } | { status: 'canceled' };
