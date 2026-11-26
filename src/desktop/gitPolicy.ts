// When Pull, Fetch and the background fetch may run. Pure, and free of Node
// imports: the page uses the same rules to enable its buttons.

import type { GitRefusal, RepoStatus } from './gitTypes';

export type Decision =
  | { ok: true }
  | { ok: false; reason: GitRefusal | 'up-to-date'; message: string };

const refuse = (
  reason: GitRefusal | 'up-to-date',
  message: string,
): Decision => ({ ok: false, reason, message });

const OPERATION_NAMES: Record<NonNullable<RepoStatus['operation']>, string> = {
  merge: 'A merge',
  rebase: 'A rebase',
  'cherry-pick': 'A cherry-pick',
  revert: 'A revert',
  bisect: 'A bisect',
};

/** What must hold before a pull even fetches. */
export function pullPrecheck(repo: RepoStatus): Decision {
  if (repo.operation !== null) {
    return refuse(
      'in-progress',
      `${OPERATION_NAMES[repo.operation]} is in progress. Finish or abort it with your usual git tool first.`,
    );
  }
  if (repo.locked) {
    return refuse(
      'locked',
      'Another git program is working in this repository. Wait for it to finish, then try again.',
    );
  }
  if (repo.branch === null) {
    return refuse(
      'detached',
      'No branch is checked out (detached HEAD). Check out a branch with your usual git tool to pull.',
    );
  }
  if (repo.upstream === null || repo.upstreamGone) {
    return refuse(
      'no-upstream',
      repo.upstreamGone
        ? `The upstream branch ${repo.upstream ?? ''} no longer exists on the remote. Set another one with your usual git tool.`
        : `The branch ${repo.branch} has no upstream branch to pull from. Push it or set an upstream with your usual git tool.`,
    );
  }
  if (repo.remote === null) {
    return refuse('no-remote', 'The upstream is not on a remote repository.');
  }
  return { ok: true };
}

/** Whether a pull would fast-forward, judging by the last fetch. */
export function pullDecision(repo: RepoStatus): Decision {
  const pre = pullPrecheck(repo);
  if (!pre.ok) return pre;
  const ahead = repo.ahead ?? 0;
  const behind = repo.behind ?? 0;
  if (ahead > 0 && behind > 0) {
    return refuse(
      'diverged',
      `Your branch and ${repo.upstream ?? 'its upstream'} have diverged (${ahead} local, ${behind} new upstream). The app only fast-forwards: merge or rebase with your usual git tool.`,
    );
  }
  if (ahead > 0) {
    return refuse(
      'ahead',
      `Nothing to pull: your branch has ${ahead} commit${ahead === 1 ? '' : 's'} that ${repo.upstream ?? 'the upstream'} does not. Push them with your usual git tool.`,
    );
  }
  if (behind === 0) {
    return refuse(
      'up-to-date',
      'Up to date with the last fetch. Fetch to check for new commits.',
    );
  }
  return { ok: true };
}

/** Allowed choices for the background fetch, in minutes; 0 is off. */
export const AUTO_FETCH_CHOICES = [0, 5, 10, 30, 60] as const;
export const DEFAULT_AUTO_FETCH_MINUTES = 10;

export const isAutoFetchChoice = (value: unknown): value is number =>
  typeof value === 'number' &&
  (AUTO_FETCH_CHOICES as readonly number[]).includes(value);

export interface AutoFetchInput {
  minutes: number;
  now: number;
  /** When the repo was last fetched by anything (FETCH_HEAD's time). */
  lastFetch: number | null;
  /** When the app last tried, successfully or not. */
  lastAttempt: number | null;
  focused: boolean;
  busy: boolean;
  hasRemote: boolean;
}

/** Background fetch: only while focused and idle, at most every N minutes. */
export function autoFetchDue(input: AutoFetchInput): boolean {
  if (input.minutes <= 0 || !input.focused || input.busy || !input.hasRemote) {
    return false;
  }
  const last = Math.max(input.lastFetch ?? 0, input.lastAttempt ?? 0);
  return input.now - last >= input.minutes * 60_000;
}

/** A remote name the app will pass to git: no option look-alikes. */
export const isRemoteName = (name: string): boolean =>
  /^[A-Za-z0-9_][A-Za-z0-9._/-]{0,99}$/.test(name) && !name.includes('..');
