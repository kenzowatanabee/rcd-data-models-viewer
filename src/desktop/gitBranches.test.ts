import { describe, expect, it } from 'vitest';

import {
  blockedMessage,
  branchNameProblem,
  buildBranches,
  parseRefList,
  parseTrack,
  switchBlockers,
  switchDecision,
  type SwitchInput,
} from './gitBranches';

const rec = (...fields: string[]) => `${fields.join('\0')}\0\n`;

const OUTPUT = [
  rec(
    'refs/heads/main',
    '',
    'refs/remotes/origin/main',
    'behind 2',
    '*',
    '1700000000',
    'First',
  ),
  rec(
    'refs/heads/docs/a',
    '',
    'refs/remotes/origin/docs/a',
    'ahead 1, behind 3',
    ' ',
    '1700000100',
    'Docs A',
  ),
  rec('refs/heads/solo', '', '', '', ' ', '1600000000', ''),
  rec(
    'refs/heads/old',
    '',
    'refs/remotes/origin/old',
    'gone',
    ' ',
    '1500000000',
    'x',
  ),
  rec(
    'refs/remotes/origin/HEAD',
    'refs/remotes/origin/main',
    '',
    '',
    ' ',
    '1700000000',
    'First',
  ),
  rec('refs/remotes/origin/main', '', '', '', ' ', '1700000000', 'First'),
  rec('refs/remotes/origin/docs/a', '', '', '', ' ', '1700000100', 'Docs A'),
  rec(
    'refs/remotes/origin/docs/new',
    '',
    '',
    '',
    ' ',
    '1700000200',
    'New: a subject with\ttab',
  ),
  rec('refs/remotes/origin/solo', '', '', '', ' ', '1600000001', 's'),
  rec('refs/remotes/other/x', '', '', '', ' ', '1700000300', 'other remote'),
  rec('refs/tags/v1', '', '', '', ' ', '1700000300', 'tag'),
  rec('refs/stash', '', '', '', ' ', '1700000300', 'stash'),
].join('');

describe('ref list parsing', () => {
  it('reads every field, NUL separated', () => {
    const records = parseRefList(OUTPUT);
    expect(records).toHaveLength(12);
    expect(records[0]).toEqual({
      ref: 'refs/heads/main',
      symref: '',
      upstream: 'refs/remotes/origin/main',
      track: 'behind 2',
      head: true,
      date: 1700000000,
      subject: 'First',
    });
    expect(records[2]?.subject).toBe('');
  });

  it('skips malformed records', () => {
    expect(parseRefList('garbage\0\nrefs/heads/x\0\0\n')).toEqual([]);
  });

  it('parses tracking counts', () => {
    expect(parseTrack('')).toEqual({ ahead: 0, behind: 0, gone: false });
    expect(parseTrack('ahead 4')).toEqual({ ahead: 4, behind: 0, gone: false });
    expect(parseTrack('ahead 1, behind 2')).toEqual({
      ahead: 1,
      behind: 2,
      gone: false,
    });
    expect(parseTrack('gone').gone).toBe(true);
  });
});

describe('building the branch list', () => {
  const built = buildBranches(parseRefList(OUTPUT), 'origin', 42);

  it('lists locals (current first) then untracked remote branches only', () => {
    expect(
      built.list.branches.map((branch) => `${branch.kind}:${branch.name}`),
    ).toEqual([
      'local:main',
      'local:docs/a',
      'local:solo',
      'local:old',
      'remote:docs/new',
      'remote:solo',
    ]);
    expect(built.list).toMatchObject({
      remote: 'origin',
      current: 'main',
      truncated: false,
      lastFetch: 42,
    });
  });

  it('keeps upstream, ahead/behind, gone and dates', () => {
    const [main, docs, solo, old] = built.list.branches;
    expect(main).toMatchObject({
      current: true,
      upstream: 'origin/main',
      ahead: 0,
      behind: 2,
      date: 1700000000_000,
    });
    expect(docs).toMatchObject({ ahead: 1, behind: 3 });
    expect(solo).toMatchObject({ upstream: null, ahead: null });
    expect(old).toMatchObject({ upstreamGone: true, ahead: null });
    const remoteSolo = built.list.branches.find(
      (branch) => branch.kind === 'remote' && branch.name === 'solo',
    );
    expect(remoteSolo?.localExists).toBe(true);
  });

  it('never includes HEAD pointers, tags, stashes or other remotes', () => {
    expect([...built.remoteNames].sort()).toEqual([
      'docs/a',
      'docs/new',
      'main',
      'solo',
    ]);
    const names = built.list.branches.map((branch) => branch.name);
    expect(names).not.toContain('HEAD');
    expect(names).not.toContain('x');
    expect(names).not.toContain('v1');
  });

  it('caps the list, keeping the current branch', () => {
    const capped = buildBranches(parseRefList(OUTPUT), 'origin', null, 2);
    expect(capped.list.truncated).toBe(true);
    expect(capped.list.branches.map((branch) => branch.name)).toEqual([
      'main',
      'docs/a',
    ]);
    expect(capped.localNames.size).toBe(4);
  });

  it('shortens long subjects', () => {
    const long = 'x'.repeat(300);
    const one = buildBranches(
      parseRefList(rec('refs/heads/a', '', '', '', '*', '1', long)),
      null,
      null,
    );
    expect(one.list.branches[0]?.subject.length).toBeLessThanOrEqual(120);
  });
});

describe('branch names', () => {
  it('accepts ordinary and unusual but legal names', () => {
    for (const name of [
      'main',
      'docs/some-change',
      'feature/a.b_c+d',
      'ünïcode/ñame',
      'x@y',
      'a#b,c',
    ]) {
      expect(branchNameProblem(name), name).toBeNull();
    }
  });

  it('rejects option look-alikes and anything git would not take', () => {
    for (const name of [
      '',
      '-f',
      '--force',
      '--detach',
      '-c',
      '--orphan=x',
      'a\nb',
      'a\0b',
      'refs/heads/../x',
      '@{-1}',
      'HEAD',
      '@',
      'a b',
      'a~1',
      'a^',
      'a:b',
      'a?',
      'a*',
      'a[b',
      'a\\b',
      '/a',
      'a/',
      'a//b',
      'a.',
      '.a',
      'a/.b',
      'a.lock',
      'a/b.lock/c',
      'x'.repeat(251),
    ]) {
      expect(branchNameProblem(name), JSON.stringify(name)).not.toBeNull();
    }
  });
});

describe('switch decision', () => {
  const branches = {
    localNames: new Set(['main', 'docs/a', 'solo']),
    remoteNames: new Set(['main', 'docs/a', 'docs/new', 'solo']),
  };
  const base: SwitchInput = {
    target: { kind: 'local', name: 'docs/a' },
    repo: { branch: 'main', operation: null, locked: false, head: 'abc1234' },
    branches,
    remote: 'origin',
    headReachable: null,
    confirmDetached: false,
  };

  it('switches to a local branch', () => {
    expect(switchDecision(base)).toEqual({
      ok: true,
      plan: { mode: 'local', branch: 'docs/a', behindNote: false },
    });
  });

  it('creates a tracking branch for a remote-only one, by full ref', () => {
    expect(
      switchDecision({ ...base, target: { kind: 'remote', name: 'docs/new' } }),
    ).toEqual({
      ok: true,
      plan: {
        mode: 'track',
        branch: 'docs/new',
        start: 'refs/remotes/origin/docs/new',
        upstream: 'origin/docs/new',
      },
    });
  });

  it('uses the local branch when one has the remote branch’s name', () => {
    expect(
      switchDecision({ ...base, target: { kind: 'remote', name: 'solo' } }),
    ).toEqual({
      ok: true,
      plan: { mode: 'local', branch: 'solo', behindNote: true },
    });
  });

  it('refuses with a reason', () => {
    const reason = (input: Partial<SwitchInput>) => {
      const decision = switchDecision({ ...base, ...input });
      return decision.ok ? 'ok' : decision.reason;
    };
    expect(reason({ target: { kind: 'local', name: '--force' } })).toBe(
      'invalid-branch',
    );
    expect(reason({ target: { kind: 'local', name: 'gone' } })).toBe(
      'no-branch',
    );
    expect(reason({ target: { kind: 'remote', name: 'gone' } })).toBe(
      'no-branch',
    );
    expect(reason({ target: { kind: 'local', name: 'main' } })).toBe(
      'already-current',
    );
    expect(reason({ repo: { ...base.repo, operation: 'merge' } })).toBe(
      'in-progress',
    );
    expect(reason({ repo: { ...base.repo, locked: true } })).toBe('locked');
    expect(
      reason({ target: { kind: 'remote', name: 'docs/new' }, remote: null }),
    ).toBe('no-branch');
  });

  it('detached HEAD: allowed when a branch has the commit, else confirmed', () => {
    const detached = { ...base.repo, branch: null };
    expect(
      switchDecision({ ...base, repo: detached, headReachable: true }).ok,
    ).toBe(true);
    const lost = switchDecision({
      ...base,
      repo: detached,
      headReachable: false,
    });
    expect(lost).toMatchObject({ ok: false, reason: 'unreachable-head' });
    expect(
      switchDecision({
        ...base,
        repo: detached,
        headReachable: false,
        confirmDetached: true,
      }).ok,
    ).toBe(true);
  });
});

describe('switch refusals from git', () => {
  it('names tracked and untracked files in the way', () => {
    const stderr = [
      'error: Your local changes to the following files would be overwritten by checkout:',
      '\tdocs/datasets/a.md',
      '\tREADME.md',
      'Please commit your changes or stash them before you switch branches.',
      'error: The following untracked working tree files would be overwritten by checkout:',
      '\tdocs/new file.md',
      'Please move or remove them before you switch branches.',
      'Aborting',
    ].join('\n');
    const blockers = switchBlockers(stderr);
    expect(blockers).toEqual({
      tracked: ['docs/datasets/a.md', 'README.md'],
      untracked: ['docs/new file.md'],
    });
    const message = blockedMessage('docs/x', blockers);
    expect(message).toContain(
      'commit or stash your changes to docs/datasets/a.md, README.md',
    );
    expect(message).toContain('untracked file docs/new file.md');
    expect(message).toContain('nothing was changed');
  });

  it('reads the "would be removed" form and ignores other errors', () => {
    expect(
      switchBlockers(
        'error: The following untracked working tree files would be removed by checkout:\n\tx.md\nAborting\n',
      ).untracked,
    ).toEqual(['x.md']);
    expect(switchBlockers('fatal: invalid reference: x\n')).toEqual({
      tracked: [],
      untracked: [],
    });
  });
});
