import { describe, expect, it } from 'vitest';

import { autoFetchDue, isRemoteName, pullDecision } from './gitPolicy';
import type { RepoStatus } from './gitTypes';

const repo = (change: Partial<RepoStatus> = {}): RepoStatus => ({
  topLevel: '/r',
  subfolder: null,
  branch: 'main',
  head: 'abc1234',
  upstream: 'origin/main',
  upstreamGone: false,
  ahead: 0,
  behind: 2,
  changes: { modified: 0, untracked: 0, conflicted: 0 },
  operation: null,
  locked: false,
  lastFetch: null,
  remote: { name: 'origin', url: 'https://github.com/o/r.git' },
  ...change,
});

const reason = (change: Partial<RepoStatus>) => {
  const decision = pullDecision(repo(change));
  return decision.ok ? 'ok' : decision.reason;
};

describe('pullDecision', () => {
  it('allows only a clean fast-forward', () => {
    expect(reason({})).toBe('ok');
    // Local edits do not block: git itself refuses if they overlap
    expect(
      reason({ changes: { modified: 3, untracked: 1, conflicted: 0 } }),
    ).toBe('ok');
    expect(reason({ behind: 0 })).toBe('up-to-date');
    expect(reason({ ahead: 1, behind: 0 })).toBe('ahead');
    expect(reason({ ahead: 1, behind: 1 })).toBe('diverged');
    expect(reason({ branch: null })).toBe('detached');
    expect(reason({ upstream: null, ahead: null, behind: null })).toBe(
      'no-upstream',
    );
    expect(reason({ upstreamGone: true, ahead: null, behind: null })).toBe(
      'no-upstream',
    );
    expect(reason({ operation: 'rebase' })).toBe('in-progress');
    expect(reason({ locked: true })).toBe('locked');
    expect(reason({ remote: null })).toBe('no-remote');
  });

  it('says what to do next', () => {
    const decision = pullDecision(repo({ ahead: 2, behind: 3 }));
    expect(decision.ok ? '' : decision.message).toContain('usual git tool');
  });
});

describe('autoFetchDue', () => {
  const base = {
    minutes: 10,
    now: 1_000_000_000,
    lastFetch: null,
    lastAttempt: null,
    focused: true,
    busy: false,
    hasRemote: true,
  };
  it('runs when focused, idle and due', () => {
    expect(autoFetchDue(base)).toBe(true);
    expect(autoFetchDue({ ...base, lastFetch: base.now - 9 * 60_000 })).toBe(
      false,
    );
    expect(autoFetchDue({ ...base, lastAttempt: base.now - 10 * 60_000 })).toBe(
      true,
    );
    expect(autoFetchDue({ ...base, lastAttempt: base.now - 60_000 })).toBe(
      false,
    );
  });
  it('never when off, unfocused, busy or without a remote', () => {
    expect(autoFetchDue({ ...base, minutes: 0 })).toBe(false);
    expect(autoFetchDue({ ...base, focused: false })).toBe(false);
    expect(autoFetchDue({ ...base, busy: true })).toBe(false);
    expect(autoFetchDue({ ...base, hasRemote: false })).toBe(false);
  });
});

describe('isRemoteName', () => {
  it('rejects option look-alikes', () => {
    expect(isRemoteName('origin')).toBe(true);
    expect(isRemoteName('my-fork')).toBe(true);
    for (const name of ['-x', '--upload-pack=x', '', '.', 'a..b', 'a b']) {
      expect(isRemoteName(name), name).toBe(false);
    }
  });
});
