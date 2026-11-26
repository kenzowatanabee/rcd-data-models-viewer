// The only git operations the app runs: status, fetch, fast-forward pull and
// clone. Each one builds fixed argument arrays; nothing from the page is
// ever passed to git except a clone URL that `parseCloneUrl` accepted.
import fs from 'node:fs';
import path from 'node:path';

import type { GitRunner, RunResult } from './gitRunner';
import {
  categorise,
  configValue,
  failureMessage,
  operationInProgress,
  overwrittenFiles,
  parseCloneProgress,
  parseConfigList,
  parsePorcelainV2,
  unsafeLocalConfig,
} from './gitParse';
import { isRemoteName, pullDecision, pullPrecheck } from './gitPolicy';
import type {
  ActionResult,
  CloneProgress,
  GitFailed,
  GitFailure,
  GitRefused,
  RepoStatus,
  StatusResult,
} from './gitTypes';
import { displayRemoteUrl, folderNameProblem, shortDetail } from './gitUrl';

export const TIMEOUTS = {
  status: 15_000,
  /** A user's fetch may wait on the credential manager's sign-in window. */
  fetch: 180_000,
  backgroundFetch: 60_000,
  merge: 60_000,
  clone: 30 * 60_000,
} as const;

/** Every argument array the app hands to git, in one place to audit. */
export const GIT_ARGS = {
  revParse: [
    'rev-parse',
    '--show-toplevel',
    '--absolute-git-dir',
    '--git-common-dir',
    '--show-prefix',
  ],
  config: ['config', '--show-scope', '-z', '--list'],
  status: [
    'status',
    '--porcelain=v2',
    '--branch',
    '-z',
    '--untracked-files=normal',
    '--ignore-submodules=all',
  ],
  fetch: (remote: string) => [
    'fetch',
    '--prune',
    '--recurse-submodules=no',
    '--',
    remote,
  ],
  merge: ['merge', '--ff-only', '--no-stat', '--no-edit', '@{upstream}'],
  head: ['rev-parse', '--verify', 'HEAD'],
  countCommits: (from: string, to: string) => [
    'rev-list',
    '--count',
    `${from}..${to}`,
  ],
  changedFiles: (from: string, to: string) => [
    'diff',
    '--name-only',
    '--no-ext-diff',
    '--no-textconv',
    '-z',
    from,
    to,
    '--',
  ],
  clone: (url: string, target: string) => [
    'clone',
    '--progress',
    '--no-recurse-submodules',
    '--',
    url,
    target,
  ],
} as const;

const failed = (
  category: GitFailure,
  action: string,
  result?: RunResult,
): GitFailed => {
  const raw = result === undefined ? '' : (result.spawnError ?? result.stderr);
  const detail = shortDetail(raw);
  return {
    status: 'failed',
    category,
    message: failureMessage(category, action),
    ...(detail === '' ? {} : { detail }),
  };
};

/** The category of a failed run: timeouts and cancels first. */
function failureOf(result: RunResult, action: string): GitFailed {
  if (result.canceled) return failed('canceled', action, result);
  if (result.timedOut) return failed('timeout', action, result);
  if (result.spawnError !== undefined)
    return failed('git-missing', action, result);
  return failed(categorise(result.stderr), action, result);
}

const ok = (result: RunResult) =>
  result.code === 0 && !result.timedOut && !result.canceled;

const fileExists = (file: string) => {
  try {
    fs.statSync(file);
    return true;
  } catch {
    return false;
  }
};

function mtime(file: string): number | null {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return null;
  }
}

/** Status of the work tree holding `folder`; git touches nothing. */
export async function readStatus(
  git: GitRunner,
  folder: string,
): Promise<StatusResult> {
  const action = 'read the status';
  const opts = { cwd: folder, timeoutMs: TIMEOUTS.status };
  const where = await git.run(GIT_ARGS.revParse, opts);
  if (!ok(where)) return failureOf(where, action);
  const [topLevel = '', gitDir = '', commonRaw = '', prefix = ''] =
    where.stdout.split(/\r?\n/);
  const commonDir = path.resolve(folder, commonRaw);

  const config = await git.run(GIT_ARGS.config, opts);
  if (!ok(config)) return failureOf(config, action);
  const entries = parseConfigList(config.stdout);
  const unsafe = unsafeLocalConfig(entries);
  if (unsafe.length > 0) {
    return {
      ...failed('unsafe-config', action),
      detail: `Set in this repository's config: ${unsafe.join(', ')}`,
    };
  }

  const status = await git.run(GIT_ARGS.status, opts);
  if (!ok(status)) return failureOf(status, action);
  const parsed = parsePorcelainV2(status.stdout);

  const remoteName =
    (parsed.branch === null
      ? null
      : configValue(entries, `branch.${parsed.branch}.remote`)) ??
    (configValue(entries, 'remote.origin.url') === null ? null : 'origin');
  const remoteUrl =
    remoteName === null
      ? null
      : configValue(entries, `remote.${remoteName}.url`);

  const repo: RepoStatus = {
    topLevel: path.normalize(topLevel),
    subfolder: prefix === '' ? null : prefix,
    branch: parsed.branch,
    head: parsed.oid === null ? null : parsed.oid.slice(0, 7),
    upstream: parsed.upstream,
    upstreamGone: parsed.upstream !== null && parsed.ahead === null,
    ahead: parsed.ahead,
    behind: parsed.behind,
    changes: {
      modified: parsed.modified,
      untracked: parsed.untracked,
      conflicted: parsed.conflicted,
    },
    operation: operationInProgress((name) =>
      fileExists(path.join(gitDir, name)),
    ),
    locked: fileExists(path.join(gitDir, 'index.lock')),
    lastFetch: mtime(path.join(commonDir, 'FETCH_HEAD')),
    remote:
      remoteName !== null && remoteUrl !== null && isRemoteName(remoteName)
        ? { name: remoteName, url: displayRemoteUrl(remoteUrl) }
        : null,
  };
  return { status: 'ok', repo };
}

export interface FetchOptions {
  interactive: boolean;
  signal?: AbortSignal;
}

/** `git fetch --prune` of the remote the branch tracks (else origin). */
export async function fetchRepo(
  git: GitRunner,
  folder: string,
  options: FetchOptions,
): Promise<ActionResult> {
  const before = await readStatus(git, folder);
  if (before.status !== 'ok') return before;
  const remote = before.repo.remote;
  if (remote === null) {
    return {
      status: 'refused',
      reason: 'no-remote',
      message: 'This repository has no remote to fetch from.',
    };
  }
  const result = await git.run(GIT_ARGS.fetch(remote.name), {
    cwd: folder,
    timeoutMs: options.interactive ? TIMEOUTS.fetch : TIMEOUTS.backgroundFetch,
    interactive: options.interactive,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  if (!ok(result)) return failureOf(result, 'fetch');
  const after = await readStatus(git, folder);
  if (after.status !== 'ok') return after;
  const behind = after.repo.behind ?? 0;
  return {
    status: 'ok',
    action: 'fetch',
    message:
      after.repo.upstream === null
        ? `Fetched ${remote.name}.`
        : behind === 0
          ? 'Up to date.'
          : `${behind} new commit${behind === 1 ? '' : 's'} on ${after.repo.upstream}.`,
  };
}

/**
 * Fetch, then `git merge --ff-only @{upstream}`. Anything but a clean
 * fast-forward is refused before git changes a thing.
 */
export async function pullRepo(
  git: GitRunner,
  folder: string,
  options: { signal?: AbortSignal } = {},
): Promise<ActionResult> {
  const first = await readStatus(git, folder);
  if (first.status !== 'ok') return first;
  const pre = pullPrecheck(first.repo);
  if (!pre.ok && pre.reason !== 'up-to-date') {
    return { status: 'refused', reason: pre.reason, message: pre.message };
  }

  const fetched = await fetchRepo(git, folder, {
    interactive: true,
    ...options,
  });
  if (fetched.status !== 'ok') return fetched;

  const now = await readStatus(git, folder);
  if (now.status !== 'ok') return now;
  const repo = now.repo;
  const decision = pullDecision(repo);
  if (!decision.ok) {
    if (decision.reason === 'up-to-date') {
      return {
        status: 'ok',
        action: 'pull',
        message: 'Already up to date.',
        commits: 0,
        files: 0,
      };
    }
    return {
      status: 'refused',
      reason: decision.reason,
      message: decision.message,
    };
  }

  const opts = { cwd: folder, timeoutMs: TIMEOUTS.status };
  const old = await git.run(GIT_ARGS.head, opts);
  if (!ok(old)) return failureOf(old, 'pull');
  const from = old.stdout.trim();

  // Not cancellable: stopping a checkout halfway would leave a mess
  const merged = await git.run(GIT_ARGS.merge, {
    cwd: folder,
    timeoutMs: TIMEOUTS.merge,
  });
  if (!ok(merged)) {
    const files = overwrittenFiles(merged.stderr);
    if (files.length > 0) {
      return {
        status: 'refused',
        reason: 'would-overwrite',
        files,
        message: `Pulling would overwrite your uncommitted changes to ${files.length === 1 ? 'this file' : 'these files'}. Nothing was changed. Commit, stash or undo them with your usual git tool, then pull again.`,
      };
    }
    const failure = failureOf(merged, 'pull');
    if (failure.category === 'non-fast-forward') {
      return {
        status: 'refused',
        reason: 'diverged',
        message: failure.message,
      };
    }
    return failure;
  }

  const head = await git.run(GIT_ARGS.head, opts);
  const to = head.stdout.trim();
  const [commits, changed] = await Promise.all([
    git.run(GIT_ARGS.countCommits(from, to), opts),
    git.run(GIT_ARGS.changedFiles(from, to), opts),
  ]);
  const commitCount = Number(commits.stdout.trim()) || 0;
  const fileCount = changed.stdout
    .split('\0')
    .filter((name) => name !== '').length;
  const dirty =
    repo.changes.modified + repo.changes.untracked + repo.changes.conflicted >
    0;
  return {
    status: 'ok',
    action: 'pull',
    commits: commitCount,
    files: fileCount,
    head: to.slice(0, 7),
    keptLocalEdits: dirty,
    message: `Pulled ${commitCount} commit${commitCount === 1 ? '' : 's'}, ${fileCount} file${fileCount === 1 ? '' : 's'} changed; now at ${to.slice(0, 7)}.${dirty ? ' Your uncommitted local edits were kept.' : ''}`,
  };
}

/** The new folder for a clone, or why it cannot be used. */
export function cloneTarget(
  parent: string,
  name: string,
):
  | { ok: true; target: string }
  | {
      ok: false;
      reason: 'no-destination' | 'destination-exists';
      message: string;
    } {
  const problem = folderNameProblem(name);
  if (problem !== null) {
    return { ok: false, reason: 'no-destination', message: problem };
  }
  if (!path.isAbsolute(parent) || !isDirectory(parent)) {
    return {
      ok: false,
      reason: 'no-destination',
      message: 'Choose an existing folder to clone into.',
    };
  }
  // `name` has no separators, so this is always directly inside `parent`
  const target = path.join(path.resolve(parent), name);
  if (fs.existsSync(target)) {
    return {
      ok: false,
      reason: 'destination-exists',
      message: `${target} already exists. Choose another folder, or open the existing one with "Choose folder…".`,
    };
  }
  return { ok: true, target };
}

function isDirectory(folder: string): boolean {
  try {
    return fs.statSync(folder).isDirectory();
  } catch {
    return false;
  }
}

export interface CloneOptions {
  signal?: AbortSignal;
  onProgress?: (progress: CloneProgress) => void;
}

export type CloneOutcome =
  { status: 'ok'; folder: string } | GitRefused | GitFailed;

/**
 * `git clone -- <url> <parent>/<name>`. The caller has validated `url`
 * with `parseCloneUrl` (tests pass a local remote here directly). The app
 * creates the empty target folder itself first, so on failure or cancel it
 * removes exactly the folder this run created and nothing else.
 */
export async function cloneRepo(
  git: GitRunner,
  source: { url: string; name: string },
  parent: string,
  options: CloneOptions = {},
): Promise<CloneOutcome> {
  const checked = cloneTarget(parent, source.name);
  if (!checked.ok) {
    return {
      status: 'refused',
      reason: checked.reason,
      message: checked.message,
    };
  }
  const target = checked.target;
  try {
    // Not recursive: fails if anything appeared there in the meantime
    fs.mkdirSync(target);
  } catch (error) {
    return {
      status: 'refused',
      reason: 'destination-exists',
      message: `Could not create ${target}: ${(error as Error).message}`,
    };
  }
  const result = await git.run(GIT_ARGS.clone(source.url, target), {
    cwd: parent,
    timeoutMs: TIMEOUTS.clone,
    interactive: true,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    onStderr: (chunk) => {
      const progress = parseCloneProgress(chunk);
      if (progress !== null) options.onProgress?.(progress);
    },
  });
  if (ok(result)) return { status: 'ok', folder: target };
  fs.rmSync(target, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
  return failureOf(result, 'clone');
}
