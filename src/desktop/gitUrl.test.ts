import { describe, expect, it } from 'vitest';

import {
  SUGGESTED_CLONE_URL,
  displayRemoteUrl,
  folderNameProblem,
  parseCloneUrl,
  scrubCredentials,
  shortDetail,
} from './gitUrl';

describe('parseCloneUrl', () => {
  it('accepts GitHub https and SSH forms, canonicalised', () => {
    expect(parseCloneUrl(SUGGESTED_CLONE_URL)).toEqual({
      ok: true,
      kind: 'https',
      name: 'rcd-data-models',
      url: 'https://github.com/kenzowatanabee/rcd-data-models.git',
    });
    expect(parseCloneUrl(' https://github.com/o/r.git/ ')).toMatchObject({
      ok: true,
      name: 'r',
    });
    expect(parseCloneUrl('git@github.com:o-x/r.y.git')).toEqual({
      ok: true,
      kind: 'ssh',
      name: 'r.y',
      url: 'git@github.com:o-x/r.y.git',
    });
  });

  it('refuses injection attempts, other schemes, hosts and credentials', () => {
    for (const input of [
      '',
      '--upload-pack=touch /tmp/x',
      '-oProxyCommand=touch /tmp/x',
      'ext::sh -c touch% /tmp/x',
      'https::ext::sh',
      'file:///etc/passwd',
      'file://github.com/o/r',
      '/home/user/repo',
      '../repo',
      'C:\\repo',
      'http://github.com/o/r',
      'ssh://git@github.com/o/r.git',
      'git://github.com/o/r.git',
      'https://user:token@github.com/o/r.git',
      'https://ghp_abcdefghijklmnopqrstuvwxyz@github.com/o/r.git',
      'https://github.com.evil.example/o/r',
      'https://gitlab.com/o/r',
      'https://github.com:8443/o/r',
      'https://github.com/o',
      'https://github.com/o/r/tree/main',
      'https://github.com/o/r?x=1',
      'https://github.com/-o/r',
      'https://github.com/o/..',
      'https://github.com/o/-r',
      'https://github.com/o/r x',
      'git@github.com:o/r;touch',
      'git@evil.example:o/r.git',
      'git@github.com:-o/r.git',
      `https://github.com/o/${'r'.repeat(101)}`,
      'https://github.com/o/r\n--upload-pack=x',
    ]) {
      expect(parseCloneUrl(input).ok, input).toBe(false);
    }
  });

  it('explains why', () => {
    expect(parseCloneUrl('https://gitlab.com/o/r')).toMatchObject({
      reason: 'Only github.com repositories can be cloned',
    });
    expect(parseCloneUrl('https://u:p@github.com/o/r')).toMatchObject({
      reason: expect.stringContaining('credential manager'),
    });
  });
});

describe('folderNameProblem', () => {
  it('allows plain names only', () => {
    expect(folderNameProblem('rcd-data-models')).toBeNull();
    for (const name of [
      '',
      '.',
      '..',
      '.git',
      '-x',
      'a/b',
      'a\\b',
      'con',
      'NUL.txt',
      'x.',
      'a b',
    ]) {
      expect(folderNameProblem(name), name).not.toBeNull();
    }
  });
});

describe('credential scrubbing', () => {
  it('removes credentials from realistic git output', () => {
    const text = [
      "fatal: unable to access 'https://kenzo:ghp_1234567890abcdefghijABCDEFGHIJ@github.com/o/r.git/': The requested URL returned error: 403",
      'remote: Invalid username or password.',
      "fatal: Authentication failed for 'https://x-access-token:gho_aaaaaaaaaaaaaaaaaaaaaaaa@github.com/o/r.git/'",
      '> Authorization: Basic a2Vuem86c2VjcmV0cGFzcw==',
      'token github_pat_11AAAAAAA0123456789_abcdefghijklmnop',
      'password=hunter2',
    ].join('\n');
    const clean = scrubCredentials(text);
    for (const secret of [
      'ghp_1234567890',
      'kenzo',
      'gho_aaa',
      'a2Vuem86',
      'github_pat_',
      'hunter2',
    ]) {
      expect(clean).not.toContain(secret);
    }
    expect(clean).toContain('https://***@github.com/o/r.git/');
    expect(clean).toContain('Authorization: ***');
  });

  it('shortens long detail', () => {
    expect(shortDetail('x'.repeat(5000))).toHaveLength(2001);
  });

  it('strips user info from remote URLs to show', () => {
    expect(displayRemoteUrl('https://u:p@github.com/o/r.git')).toBe(
      'https://github.com/o/r.git',
    );
    expect(displayRemoteUrl('git@github.com:o/r.git')).toBe(
      'git@github.com:o/r.git',
    );
  });
});
