import { describe, expect, it } from 'vitest';

import type { GitState, RepoStatus } from '../desktop/gitTypes';
import { indicatorOf, pullAvailability, timeAgo } from './gitView';

const repo: RepoStatus = {
  topLevel: '/r',
  subfolder: null,
  branch: 'main',
  head: 'abc1234',
  upstream: 'origin/main',
  upstreamGone: false,
  ahead: 0,
  behind: 3,
  changes: { modified: 1, untracked: 1, conflicted: 0 },
  operation: null,
  locked: false,
  lastFetch: null,
  remote: { name: 'origin', url: 'https://github.com/o/r.git' },
};

const state = (change: Partial<GitState> = {}): GitState => ({
  unavailable: null,
  status: { status: 'ok', repo },
  running: null,
  last: null,
  autoFetchMinutes: 10,
  backgroundProblem: null,
  ...change,
});

describe('indicatorOf', () => {
  it('branch, behind and the local changes dot', () => {
    expect(indicatorOf(state())).toMatchObject({
      label: 'main',
      behind: 3,
      ahead: 0,
      dirty: true,
      summary: 'Git: Branch main, 3 behind, 2 local changes',
    });
  });
  it('the states without a branch to show', () => {
    expect(
      indicatorOf(state({ unavailable: 'Git was not found.' })).label,
    ).toBe('Git not installed');
    expect(
      indicatorOf(
        state({
          status: { status: 'failed', category: 'not-repo', message: 'x' },
        }),
      ).label,
    ).toBe('Not a git repository');
    expect(
      indicatorOf(
        state({
          status: {
            status: 'ok',
            repo: { ...repo, upstream: null, ahead: null, behind: null },
          },
        }),
      ).note,
    ).toBe('no upstream');
  });
});

describe('pullAvailability', () => {
  it('on when it would fast-forward, else why', () => {
    expect(pullAvailability(state())).toEqual({ enabled: true, reason: null });
    expect(pullAvailability(state({ running: 'fetch' })).enabled).toBe(false);
    const ahead = pullAvailability(
      state({
        status: { status: 'ok', repo: { ...repo, ahead: 1, behind: 0 } },
      }),
    );
    expect(ahead.enabled).toBe(false);
    expect(ahead.reason).toContain('Push them');
  });
});

describe('timeAgo', () => {
  it('reads naturally', () => {
    expect(timeAgo(null, 0)).toBe('never');
    expect(timeAgo(0, 30_000)).toBe('just now');
    expect(timeAgo(0, 60_000)).toBe('1 minute ago');
    expect(timeAgo(0, 3 * 3_600_000)).toBe('3 hours ago');
    expect(timeAgo(0, 72 * 3_600_000)).toBe('3 days ago');
  });
});
