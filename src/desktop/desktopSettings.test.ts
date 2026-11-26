import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SETTINGS,
  parseSettings,
  pushRecentFolder,
  readSettingsFile,
  writeSettingsFile,
} from './desktopSettings';

describe('parseSettings', () => {
  it('tolerates missing, corrupt and odd files', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{oops')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('[1,2]')).toEqual(DEFAULT_SETTINGS);
    expect(
      parseSettings(
        JSON.stringify({
          docsPath: 3,
          recentFolders: 'x',
          window: { x: 'a' },
          port: 80,
        }),
      ),
    ).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values and drops bad entries', () => {
    expect(
      parseSettings(
        JSON.stringify({
          docsPath: '/docs',
          recentFolders: [
            '/docs',
            7,
            '',
            '/docs',
            '/a',
            '/b',
            '/c',
            '/d',
            '/e',
          ],
          window: { x: 10.4, y: -20, width: 1200, height: 800, maximized: 1 },
          port: 51234,
        }),
      ),
    ).toEqual({
      docsPath: '/docs',
      recentFolders: ['/docs', '/a', '/b', '/c', '/d'],
      window: { x: 10, y: -20, width: 1200, height: 800, maximized: false },
      port: 51234,
    });
  });
});

describe('pushRecentFolder', () => {
  it('moves the folder first and keeps five', () => {
    const list = ['/a', '/b', '/c', '/d', '/e'];
    expect(pushRecentFolder(list, '/c', false)).toEqual([
      '/c',
      '/a',
      '/b',
      '/d',
      '/e',
    ]);
    expect(pushRecentFolder(list, '/f', false)).toEqual([
      '/f',
      '/a',
      '/b',
      '/c',
      '/d',
    ]);
  });

  it('ignores case where the file system does', () => {
    expect(pushRecentFolder(['C:\\Docs'], 'c:\\docs', true)).toEqual([
      'c:\\docs',
    ]);
    expect(pushRecentFolder(['/Docs'], '/docs', false)).toEqual([
      '/docs',
      '/Docs',
    ]);
  });
});

describe('settings file', () => {
  it('round-trips and reads a missing file as defaults', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rcd-settings-'));
    const file = path.join(dir, 'nested', 'settings.json');
    expect(readSettingsFile(file)).toEqual(DEFAULT_SETTINGS);
    const settings = { ...DEFAULT_SETTINGS, docsPath: '/docs', port: 40000 };
    writeSettingsFile(file, settings);
    expect(readSettingsFile(file)).toEqual(settings);
    expect(fs.readdirSync(path.dirname(file))).toEqual(['settings.json']);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
