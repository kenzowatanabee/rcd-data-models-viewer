// What the top bar's git indicator and popover say. Pure.
import { pullDecision } from '../desktop/gitPolicy';
import type { GitState, RepoStatus } from '../desktop/gitTypes';

export interface Indicator {
  /** The main text: the branch, or the state when there is none. */
  label: string;
  tone: 'normal' | 'muted' | 'warning';
  behind: number;
  ahead: number;
  dirty: boolean;
  /** A short note after the label, such as "no upstream". */
  note: string | null;
  /** The whole thing in words, for the button's accessible name. */
  summary: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const changeCount = (repo: RepoStatus) =>
  repo.changes.modified + repo.changes.untracked + repo.changes.conflicted;

export function indicatorOf(state: GitState | null): Indicator {
  const base = { behind: 0, ahead: 0, dirty: false, note: null };
  if (state === null) {
    return { ...base, label: 'Git', tone: 'muted', summary: 'Git: loading' };
  }
  if (state.unavailable !== null) {
    return {
      ...base,
      label: 'Git not installed',
      tone: 'warning',
      summary: `Git: ${state.unavailable}`,
    };
  }
  const status = state.status;
  if (status === null) {
    return { ...base, label: 'Git', tone: 'muted', summary: 'Git: checking' };
  }
  if (status.status === 'failed') {
    const label =
      status.category === 'not-repo'
        ? 'Not a git repository'
        : status.category === 'unsafe-directory' ||
            status.category === 'unsafe-config'
          ? 'Git: not trusted'
          : 'Git: problem';
    return {
      ...base,
      label,
      tone: 'muted',
      summary: `${label}. ${status.message}`,
    };
  }
  const repo = status.repo;
  const behind = repo.behind ?? 0;
  const ahead = repo.ahead ?? 0;
  const dirty = changeCount(repo) > 0;
  const label = repo.branch ?? `detached at ${repo.head ?? '?'}`;
  const note =
    repo.operation !== null
      ? `${repo.operation} in progress`
      : repo.upstream === null
        ? 'no upstream'
        : repo.upstreamGone
          ? 'upstream gone'
          : null;
  const parts = [`Branch ${label}`];
  if (note !== null) parts.push(note);
  if (behind > 0) parts.push(`${behind} behind`);
  if (ahead > 0) parts.push(`${ahead} ahead`);
  if (dirty) parts.push(`${plural(changeCount(repo), 'local change')}`);
  return {
    label,
    tone: note === null ? 'normal' : 'warning',
    behind,
    ahead,
    dirty,
    note,
    summary: `Git: ${parts.join(', ')}`,
  };
}

/** Whether the Pull button is on, and if not, why in plain words. */
export function pullAvailability(state: GitState | null): {
  enabled: boolean;
  reason: string | null;
} {
  if (state === null || state.unavailable !== null) {
    return { enabled: false, reason: state?.unavailable ?? null };
  }
  if (state.running !== null) return { enabled: false, reason: null };
  const status = state.status;
  if (status === null) return { enabled: false, reason: null };
  if (status.status !== 'ok') return { enabled: false, reason: status.message };
  const decision = pullDecision(status.repo);
  return decision.ok
    ? { enabled: true, reason: null }
    : { enabled: false, reason: decision.message };
}

export function fetchAvailability(state: GitState | null): {
  enabled: boolean;
  reason: string | null;
} {
  if (state === null || state.unavailable !== null || state.running !== null) {
    return { enabled: false, reason: null };
  }
  const status = state.status;
  if (status === null || status.status !== 'ok') {
    return { enabled: false, reason: null };
  }
  return status.repo.remote === null
    ? { enabled: false, reason: 'This repository has no remote to fetch from.' }
    : { enabled: true, reason: null };
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago". */
export function timeAgo(then: number | null, now: number): string {
  if (then === null) return 'never';
  const minutes = Math.floor(Math.max(0, now - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${plural(minutes, 'minute')} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${plural(hours, 'hour')} ago`;
  return `${plural(Math.floor(hours / 24), 'day')} ago`;
}

export function changesText(repo: RepoStatus): string {
  const { modified, untracked, conflicted } = repo.changes;
  const parts = [
    modified > 0 ? `${modified} changed` : null,
    untracked > 0 ? `${untracked} untracked` : null,
    conflicted > 0 ? `${conflicted} conflicted` : null,
  ].filter((part) => part !== null);
  return parts.length === 0 ? 'none' : parts.join(', ');
}

export const RUNNING_TEXT = {
  status: 'Checking…',
  fetch: 'Fetching…',
  pull: 'Pulling…',
  clone: 'Cloning…',
  branches: 'Listing branches…',
  switch: 'Switching branch…',
} as const;
