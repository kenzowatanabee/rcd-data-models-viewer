import { describe, expect, it } from 'vitest';

import {
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  clampSidebarWidth,
  folderName,
  motionDuration,
  nextIndex,
  parseCollapsedGroups,
  parseFlag,
  parseSidebarWidth,
  parseThemePreference,
  resolveTheme,
  serialiseCollapsedGroups,
} from './settings';

describe('theme', () => {
  it('reads the stored preference, defaulting to system', () => {
    expect(parseThemePreference('light')).toBe('light');
    expect(parseThemePreference('dark')).toBe('dark');
    expect(parseThemePreference('system')).toBe('system');
    expect(parseThemePreference(null)).toBe('system');
    expect(parseThemePreference('Dark')).toBe('system');
  });

  it('follows the system only when asked to', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('sidebar width', () => {
  it('parses a stored width within bounds', () => {
    expect(parseSidebarWidth('320')).toBe(320);
    expect(parseSidebarWidth('10')).toBe(SIDEBAR_MIN);
    expect(parseSidebarWidth('9999')).toBe(SIDEBAR_MAX);
    expect(parseSidebarWidth(null)).toBe(SIDEBAR_DEFAULT);
    expect(parseSidebarWidth('')).toBe(SIDEBAR_DEFAULT);
    expect(parseSidebarWidth('wide')).toBe(SIDEBAR_DEFAULT);
  });

  it('clamps to the bounds and to half a narrow window', () => {
    expect(clampSidebarWidth(300.4, 1440)).toBe(300);
    expect(clampSidebarWidth(100, 1440)).toBe(SIDEBAR_MIN);
    expect(clampSidebarWidth(900, 1440)).toBe(SIDEBAR_MAX);
    expect(clampSidebarWidth(400, 600)).toBe(300);
    // Never below the minimum, however narrow the window
    expect(clampSidebarWidth(400, 300)).toBe(SIDEBAR_MIN);
    expect(clampSidebarWidth(NaN, 1440)).toBe(SIDEBAR_DEFAULT);
  });
});

describe('collapsed groups', () => {
  it('round-trips known ids and drops the rest', () => {
    const groups = parseCollapsedGroups('["pipelines","nope",3,"other"]');
    expect([...groups].sort()).toEqual(['other', 'pipelines']);
    expect(serialiseCollapsedGroups(groups)).toBe('["pipelines","other"]');
  });

  it('treats unreadable values as none collapsed', () => {
    expect(parseCollapsedGroups(null).size).toBe(0);
    expect(parseCollapsedGroups('{').size).toBe(0);
    expect(parseCollapsedGroups('"datasets"').size).toBe(0);
  });

  it('reads flags strictly', () => {
    expect(parseFlag('true')).toBe(true);
    expect(parseFlag('1')).toBe(false);
    expect(parseFlag(null)).toBe(false);
  });
});

describe('folderName', () => {
  it('takes the last segment of POSIX and Windows paths', () => {
    expect(folderName('/home/me/rcd-data-models')).toBe('rcd-data-models');
    expect(folderName('/home/me/rcd-data-models/')).toBe('rcd-data-models');
    expect(folderName('C:\\Users\\me\\rcd-data-models')).toBe(
      'rcd-data-models',
    );
    expect(folderName('docs')).toBe('docs');
  });
});

describe('nextIndex', () => {
  it('moves within the list without wrapping', () => {
    expect(nextIndex(0, 3, 'ArrowDown')).toBe(1);
    expect(nextIndex(2, 3, 'ArrowDown')).toBe(2);
    expect(nextIndex(0, 3, 'ArrowUp')).toBe(0);
    expect(nextIndex(-1, 3, 'ArrowDown')).toBe(0);
    expect(nextIndex(-1, 3, 'ArrowUp')).toBe(2);
    expect(nextIndex(1, 3, 'Home')).toBe(0);
    expect(nextIndex(1, 3, 'End')).toBe(2);
  });

  it('ignores other keys and empty lists', () => {
    expect(nextIndex(1, 3, 'Enter')).toBeNull();
    expect(nextIndex(0, 0, 'ArrowDown')).toBeNull();
  });
});

describe('motionDuration', () => {
  it('drops animation for reduced motion', () => {
    expect(motionDuration(300, false)).toBe(300);
    expect(motionDuration(300, true)).toBe(0);
  });
});
