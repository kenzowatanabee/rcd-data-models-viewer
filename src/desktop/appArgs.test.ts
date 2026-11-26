import { describe, expect, it } from 'vitest';

import { appArgv, parseAppArgs } from './appArgs';

describe('appArgv', () => {
  it('takes what follows the main script, wherever switches are', () => {
    expect(
      appArgv(
        ['/e/electron', '--inspect=0', 'C:\\repo\\out\\main.mjs', 'docs'],
        'c:/repo/out/main.mjs',
      ),
    ).toEqual(['docs']);
  });

  it('falls back to everything after the executable', () => {
    expect(appArgv(['/app', 'docs'], null)).toEqual(['docs']);
    expect(appArgv(['/app', 'docs'], '/elsewhere/main.mjs')).toEqual(['docs']);
  });
});

describe('parseAppArgs', () => {
  it('reads the folder and skips pnpm and Chromium switches', () => {
    expect(parseAppArgs(['--', '--no-sandbox', '../docs', 'extra'])).toEqual({
      folder: '../docs',
      userDataDir: null,
    });
  });

  it('reads the user data folder', () => {
    expect(parseAppArgs(['--user-data-dir=/tmp/x'])).toEqual({
      folder: null,
      userDataDir: '/tmp/x',
    });
    expect(parseAppArgs(['--user-data-dir='])).toEqual({
      folder: null,
      userDataDir: null,
    });
  });
});
