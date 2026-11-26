import { describe, expect, it } from 'vitest';

import {
  categorise,
  configValue,
  operationInProgress,
  overwrittenFiles,
  parseCloneProgress,
  parseConfigList,
  parseGitVersion,
  parsePorcelainV2,
  unsafeLocalConfig,
  versionOk,
} from './gitParse';

describe('parsePorcelainV2', () => {
  it('reads branch, upstream, counts and entries', () => {
    const output = [
      '# branch.oid 0123456789abcdef0123456789abcdef01234567',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +1 -3',
      '1 .M N... 100644 100644 100644 aaa bbb docs/a.md',
      '2 R. N... 100644 100644 100644 aaa bbb R100 docs/new name.md',
      'docs/old.md',
      'u UU N... 100644 100644 100644 100644 a b c docs/c.md',
      '? notes.md',
      '? other.md',
      '',
    ].join('\0');
    expect(parsePorcelainV2(output)).toEqual({
      oid: '0123456789abcdef0123456789abcdef01234567',
      branch: 'main',
      upstream: 'origin/main',
      ahead: 1,
      behind: 3,
      modified: 2,
      untracked: 2,
      conflicted: 1,
    });
  });

  it('detached, initial, no upstream and gone upstream', () => {
    expect(
      parsePorcelainV2('# branch.oid (initial)\0# branch.head (detached)\0'),
    ).toMatchObject({ oid: null, branch: null, upstream: null, ahead: null });
    expect(
      parsePorcelainV2('# branch.head b\0# branch.upstream origin/b\0'),
    ).toMatchObject({ upstream: 'origin/b', ahead: null, behind: null });
  });
});

describe('config', () => {
  const list = parseConfigList(
    'global\0user.name\nKen\0local\0branch.Feature.remote\nupstream\0local\0remote.upstream.url\nhttps://github.com/o/r\0local\0core.bare\nfalse\0local\0flag\0',
  );
  it('parses scope, key and value', () => {
    expect(list[0]).toEqual({
      scope: 'global',
      key: 'user.name',
      value: 'Ken',
    });
    expect(configValue(list, 'branch.Feature.REMOTE')).toBe('upstream');
    expect(configValue(list, 'branch.feature.remote')).toBeNull();
    expect(configValue(list, 'flag')).toBe('');
  });

  it('flags repository settings that would run a program', () => {
    const entries = parseConfigList(
      [
        'local',
        'core.sshcommand\nsh -c evil',
        'local',
        'credential.helper\n!evil',
        'local',
        'credential.https://github.com.helper\n!evil',
        'local',
        'filter.x.smudge\nevil',
        'local',
        'filter.lfs.smudge\ngit-lfs smudge -- %f',
        'local',
        'remote.origin.uploadpack\nevil',
        'global',
        'credential.helper\nosxkeychain',
        'global',
        'core.sshcommand\nssh -i key',
        'local',
        'core.hookspath\n.husky',
        '',
      ].join('\0'),
    );
    expect(unsafeLocalConfig(entries)).toEqual([
      'core.sshcommand',
      'credential.helper',
      'credential.https://github.com.helper',
      'filter.x.smudge',
      'remote.origin.uploadpack',
    ]);
  });
});

describe('error categories', () => {
  it.each([
    [
      "fatal: detected dubious ownership in repository at '/r'",
      'unsafe-directory',
    ],
    [
      'fatal: not a git repository (or any of the parent directories): .git',
      'not-repo',
    ],
    ["fatal: Unable to create '/r/.git/index.lock': File exists.", 'locked'],
    [
      "fatal: unable to access 'https://github.com/o/r.git/': Could not resolve host: github.com",
      'offline',
    ],
    [
      "fatal: unable to access 'http://127.0.0.1:9/r.git/': Failed to connect to 127.0.0.1 port 9",
      'offline',
    ],
    [
      "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
      'auth',
    ],
    [
      'git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.',
      'auth',
    ],
    [
      'Host key verification failed.\nfatal: Could not read from remote repository.',
      'auth',
    ],
    [
      "remote: Repository not found.\nfatal: repository 'https://github.com/o/x.git/' not found",
      'not-found',
    ],
    [
      "fatal: '/x' does not appear to be a git repository\nfatal: Could not read from remote repository.",
      'not-found',
    ],
    ['fatal: Not possible to fast-forward, aborting.', 'non-fast-forward'],
    ['something else', 'failed'],
  ])('%s', (stderr, category) => {
    expect(categorise(stderr)).toBe(category);
  });

  it('lists the files a merge would overwrite', () => {
    const stderr = [
      'error: Your local changes to the following files would be overwritten by merge:',
      '\tdocs/a.md',
      '\tdocs/b c.md',
      'Please commit your changes or stash them before you merge.',
      'error: The following untracked working tree files would be overwritten by merge:',
      '\tnew.md',
      'Please move or remove them before you merge.',
      'Aborting',
    ].join('\n');
    expect(overwrittenFiles(stderr)).toEqual([
      'docs/a.md',
      'docs/b c.md',
      'new.md',
    ]);
  });
});

describe('small parsers', () => {
  it('operation in progress', () => {
    const has = (names: string[]) => (name: string) => names.includes(name);
    expect(operationInProgress(has([]))).toBeNull();
    expect(operationInProgress(has(['MERGE_HEAD']))).toBe('merge');
    expect(operationInProgress(has(['rebase-merge', 'MERGE_HEAD']))).toBe(
      'rebase',
    );
    expect(operationInProgress(has(['BISECT_LOG']))).toBe('bisect');
  });

  it('git version', () => {
    expect(parseGitVersion('git version 2.45.1.windows.1\n')).toEqual([2, 45]);
    expect(versionOk([2, 30])).toBe(true);
    expect(versionOk([2, 29])).toBe(false);
    expect(versionOk([3, 0])).toBe(true);
    expect(parseGitVersion('nope')).toBeNull();
  });

  it('clone progress', () => {
    expect(
      parseCloneProgress(
        'Receiving objects:  12% (1/8)\rReceiving objects:  45% (4/8), 1.2 MiB',
      ),
    ).toEqual({ phase: 'Receiving objects', percent: 45 });
    expect(parseCloneProgress("Cloning into '/x'...\n")).toEqual({
      phase: 'Cloning into',
      percent: null,
    });
    expect(
      parseCloneProgress('remote: Counting objects: 100% (5/5), done.'),
    ).toEqual({
      phase: 'Counting objects',
      percent: 100,
    });
    expect(parseCloneProgress('warning: x')).toBeNull();
  });
});
