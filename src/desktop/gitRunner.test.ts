import { describe, expect, it } from 'vitest';

import { GIT_ARGS } from './gitOps';
import { gitCandidates, gitEnv, hardeningArgs } from './gitRunner';

describe('gitEnv', () => {
  const base = {
    PATH: '/usr/bin',
    GIT_DIR: '/elsewhere',
    GIT_ASKPASS: '/bin/askpass',
    SSH_ASKPASS: '/bin/askpass',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'core.fsmonitor',
    GIT_CONFIG_VALUE_0: '/evil',
    GIT_CONFIG_GLOBAL: '/home/me/.gitconfig',
    LANG: 'fr_FR.UTF-8',
  };
  it('never prompts, stable messages, no redirection', () => {
    const env = gitEnv(base, true);
    expect(env).toMatchObject({
      PATH: '/usr/bin',
      LC_ALL: 'C',
      GIT_TERMINAL_PROMPT: '0',
      GIT_PAGER: 'cat',
      GIT_CONFIG_GLOBAL: '/home/me/.gitconfig',
    });
    for (const key of [
      'GIT_DIR',
      'GIT_ASKPASS',
      'SSH_ASKPASS',
      'GIT_CONFIG_COUNT',
      'GIT_CONFIG_KEY_0',
      'GIT_CONFIG_VALUE_0',
      'GCM_INTERACTIVE',
    ]) {
      expect(env[key], key).toBeUndefined();
    }
  });
  it('background work keeps the credential manager quiet', () => {
    expect(gitEnv(base, false).GCM_INTERACTIVE).toBe('never');
  });
});

describe('hardening and argument arrays', () => {
  it('overrides the settings that run programs', () => {
    const args = hardeningArgs('/hooks');
    expect(args).toContain('core.fsmonitor=false');
    expect(args).toContain('core.hooksPath=/hooks');
    expect(args).toContain('protocol.ext.allow=never');
    expect(args.filter((arg) => arg === '-c')).toHaveLength(args.length / 2);
  });
  it('puts -- before every positional the app passes', () => {
    expect(GIT_ARGS.fetch('origin')).toEqual([
      'fetch',
      '--prune',
      '--recurse-submodules=no',
      '--',
      'origin',
    ]);
    expect(GIT_ARGS.clone('https://github.com/o/r.git', '/p/r')).toEqual([
      'clone',
      '--progress',
      '--no-recurse-submodules',
      '--',
      'https://github.com/o/r.git',
      '/p/r',
    ]);
    expect(GIT_ARGS.merge).toEqual([
      'merge',
      '--ff-only',
      '--no-stat',
      '--no-edit',
      '@{upstream}',
    ]);
  });
});

describe('gitCandidates', () => {
  it('Windows: git.exe on absolute PATH entries, then Git for Windows', () => {
    const list = gitCandidates(
      {
        Path: 'C:\\Tools;.\\bin;"C:\\Program Files\\Git\\cmd"',
        ProgramFiles: 'C:\\Program Files',
      },
      'win32',
    );
    expect(list[0]).toBe('C:\\Tools\\git.exe');
    expect(list).toContain('C:\\Program Files\\Git\\cmd\\git.exe');
    expect(list.some((entry) => entry.startsWith('.'))).toBe(false);
  });
  it('macOS: adds Homebrew for apps started outside a terminal', () => {
    const list = gitCandidates({ PATH: '/usr/bin:/bin' }, 'darwin');
    expect(list).toContain('/opt/homebrew/bin/git');
    expect(list[0]).toBe('/usr/bin/git');
  });
});
