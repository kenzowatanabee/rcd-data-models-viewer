// Parsers for git's machine formats and its error messages. Pure: the
// commands run with LC_ALL=C, so the messages matched here are stable.

import type { CloneProgress, GitFailure, GitOperation } from './gitTypes';

export interface PorcelainStatus {
  /** Full commit id, or null before the first commit. */
  oid: string | null;
  /** Null on a detached HEAD. */
  branch: string | null;
  upstream: string | null;
  /** Null when there is no upstream or it is gone. */
  ahead: number | null;
  behind: number | null;
  modified: number;
  untracked: number;
  conflicted: number;
}

/** `git status --porcelain=v2 --branch -z`. */
export function parsePorcelainV2(output: string): PorcelainStatus {
  const status: PorcelainStatus = {
    oid: null,
    branch: null,
    upstream: null,
    ahead: null,
    behind: null,
    modified: 0,
    untracked: 0,
    conflicted: 0,
  };
  const records = output.split('\0');
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i] ?? '';
    if (record.startsWith('# branch.oid ')) {
      const oid = record.slice('# branch.oid '.length);
      status.oid = oid === '(initial)' ? null : oid;
    } else if (record.startsWith('# branch.head ')) {
      const head = record.slice('# branch.head '.length);
      status.branch = head === '(detached)' ? null : head;
    } else if (record.startsWith('# branch.upstream ')) {
      status.upstream = record.slice('# branch.upstream '.length);
    } else if (record.startsWith('# branch.ab ')) {
      const match = /^# branch\.ab \+(\d+) -(\d+)$/.exec(record);
      if (match !== null) {
        status.ahead = Number(match[1]);
        status.behind = Number(match[2]);
      }
    } else if (record.startsWith('1 ')) {
      status.modified += 1;
    } else if (record.startsWith('2 ')) {
      status.modified += 1;
      // A rename or copy is followed by its original path
      i += 1;
    } else if (record.startsWith('u ')) {
      status.conflicted += 1;
    } else if (record.startsWith('? ')) {
      status.untracked += 1;
    }
  }
  return status;
}

export interface ConfigEntry {
  scope: string;
  key: string;
  value: string;
}

/** `git config --show-scope -z --list`: `scope\0key\nvalue\0` records. */
export function parseConfigList(output: string): ConfigEntry[] {
  const parts = output.split('\0');
  const entries: ConfigEntry[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const scope = parts[i] ?? '';
    const pair = parts[i + 1] ?? '';
    const newline = pair.indexOf('\n');
    entries.push({
      scope,
      key: newline === -1 ? pair : pair.slice(0, newline),
      value: newline === -1 ? '' : pair.slice(newline + 1),
    });
  }
  return entries;
}

/** The last value of `key` (keys compare as git does: case-blind outside the subsection). */
export function configValue(
  entries: readonly ConfigEntry[],
  key: string,
): string | null {
  const want = normaliseKey(key);
  let found: string | null = null;
  for (const entry of entries) {
    if (normaliseKey(entry.key) === want) found = entry.value;
  }
  return found;
}

function normaliseKey(key: string): string {
  const first = key.indexOf('.');
  const last = key.lastIndexOf('.');
  if (first === last) return key.toLowerCase();
  return `${key.slice(0, first).toLowerCase()}${key.slice(first, last)}${key.slice(last).toLowerCase()}`;
}

/**
 * Settings in the repository's own config that make the commands the app
 * runs (status, fetch, a fast-forward) start a program, and that the app
 * cannot simply override on the command line without breaking the user's
 * own setup. Their presence in .git/config makes the app refuse.
 */
const LOCAL_EXECUTABLE_KEYS: readonly RegExp[] = [
  /^core\.sshcommand$/i,
  /^core\.gitproxy$/i,
  /^credential\.(.+\.)?helper$/i,
  /^remote\..+\.(uploadpack|receivepack)$/i,
  /^filter\..+\.(clean|smudge|process)$/i,
];

/** Git LFS installed per repo writes these; they run git-lfs only. */
function isLfsFilter(entry: ConfigEntry): boolean {
  return (
    /^filter\.lfs\.(clean|smudge|process)$/i.test(entry.key) &&
    /^git-lfs (clean|smudge|filter-process)\b/.test(entry.value)
  );
}

/** The repository-scoped keys that would run a program, for the refusal. */
export function unsafeLocalConfig(entries: readonly ConfigEntry[]): string[] {
  return entries
    .filter(
      (entry) =>
        (entry.scope === 'local' || entry.scope === 'worktree') &&
        LOCAL_EXECUTABLE_KEYS.some((pattern) => pattern.test(entry.key)) &&
        !isLfsFilter(entry),
    )
    .map((entry) => entry.key);
}

/** Which operation the files in the git folder show to be under way. */
export function operationInProgress(
  exists: (name: string) => boolean,
): GitOperation | null {
  if (exists('rebase-merge') || exists('rebase-apply')) return 'rebase';
  if (exists('MERGE_HEAD')) return 'merge';
  if (exists('CHERRY_PICK_HEAD')) return 'cherry-pick';
  if (exists('REVERT_HEAD')) return 'revert';
  if (exists('BISECT_LOG')) return 'bisect';
  return null;
}

/** `git version 2.43.0` (or `2.45.1.windows.1`) as [major, minor]. */
export function parseGitVersion(output: string): [number, number] | null {
  const match = /git version (\d+)\.(\d+)/.exec(output);
  return match === null ? null : [Number(match[1]), Number(match[2])];
}

/** The minimum: needs `--show-scope` and the safe.directory checks. */
export const MIN_GIT: [number, number] = [2, 30];

export const versionOk = (version: [number, number]) =>
  version[0] > MIN_GIT[0] ||
  (version[0] === MIN_GIT[0] && version[1] >= MIN_GIT[1]);

/** Local files a fast-forward refused to overwrite, from git's message. */
export function overwrittenFiles(stderr: string): string[] {
  const files: string[] = [];
  let inList = false;
  for (const line of stderr.split(/\r?\n/)) {
    if (/would be overwritten by (merge|checkout)/.test(line)) {
      inList = true;
    } else if (inList && line.startsWith('\t')) {
      files.push(line.slice(1));
    } else {
      inList = false;
    }
  }
  return [...new Set(files)];
}

/** Sorts git's error output into the categories the page explains. */
export function categorise(stderr: string): GitFailure {
  const text = stderr;
  if (/detected dubious ownership|safe\.directory/i.test(text)) {
    return 'unsafe-directory';
  }
  if (/not a git repository|must be run in a work tree/i.test(text)) {
    if (!/Could not read from remote/i.test(text)) return 'not-repo';
  }
  if (
    /\.lock'?: File exists|Unable to create '.*\.lock'|cannot lock ref/i.test(
      text,
    )
  ) {
    return 'locked';
  }
  if (
    /could not resolve host|could not resolve hostname|failed to connect|couldn't connect|connection timed out|network is unreachable|connection refused|operation timed out|temporary failure in name resolution|no route to host/i.test(
      text,
    )
  ) {
    return 'offline';
  }
  if (
    /authentication failed|could not read (username|password)|terminal prompts disabled|permission denied \(publickey|host key verification failed|returned error: 40[13]|invalid username or password|access denied/i.test(
      text,
    )
  ) {
    return 'auth';
  }
  if (
    /repository not found|does not appear to be a git repository|returned error: 404|not found/i.test(
      text,
    )
  ) {
    return 'not-found';
  }
  if (
    /not possible to fast-forward|non-fast-forward|diverging branches/i.test(
      text,
    )
  ) {
    return 'non-fast-forward';
  }
  return 'failed';
}

/** What to tell the user for each category. */
export function failureMessage(category: GitFailure, action: string): string {
  switch (category) {
    case 'git-missing':
      return 'Git is not installed or could not be found.';
    case 'not-repo':
      return 'This docs folder is not inside a git repository, so there is nothing to fetch or pull.';
    case 'unsafe-directory':
      return 'Git does not trust this folder because another user owns it. If it is yours, run the "git config --global --add safe.directory" command git suggests (see details) in a terminal, then try again.';
    case 'unsafe-config':
      return "This repository's own settings (.git/config) can start a program, so the app will not run git here. Check them in a terminal.";
    case 'locked':
      return 'Another git program is working in this repository (its lock file exists). Wait for it to finish, then try again. If none is running, a crashed one may have left the lock: check with your usual git tool.';
    case 'offline':
      return `Couldn't reach GitHub to ${action}. Check your connection and try again.`;
    case 'auth':
      return `GitHub did not accept your sign-in. Sign in once with your usual git tool (for example run "git fetch" in a terminal, or use GitHub Desktop), then try ${action} again here.`;
    case 'not-found':
      return 'GitHub could not find the repository, or your account cannot see it. Check the URL and that you are signed in with an account that has access.';
    case 'non-fast-forward':
      return 'Your branch and its upstream have both moved on, so a fast-forward is not possible. Merge or rebase with your usual git tool.';
    case 'timeout':
      return `Git took too long to ${action} and was stopped. Try again; if it keeps happening, run the same command in a terminal to see what it waits for.`;
    case 'canceled':
      return 'Canceled.';
    case 'failed':
      return `Git could not ${action}. See the details.`;
  }
}

/** The last progress line in a chunk of `git clone --progress` output. */
export function parseCloneProgress(chunk: string): CloneProgress | null {
  const lines = chunk.split(/[\r\n]+/).filter((line) => line.trim() !== '');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = (lines[i] ?? '').replace(/^remote:\s*/, '');
    const match = /^([A-Z][A-Za-z ]+?):\s+(\d{1,3})%/.exec(line);
    if (match !== null) {
      return {
        phase: match[1] ?? '',
        percent: Math.min(100, Number(match[2])),
      };
    }
    const phase = /^(Cloning into|Updating files|Resolving deltas)/.exec(line);
    if (phase !== null) return { phase: phase[1] ?? '', percent: null };
  }
  return null;
}
