import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it } from 'vitest';

import { appMenuTemplate, folderMenuTemplate } from './menu';

const actions = (platform: string, current: string | null) => ({
  platform,
  current,
  recent: current === null ? [] : [current, '/other'],
  openFolder: () => undefined,
  openRecent: () => undefined,
  reveal: () => undefined,
  copyPath: () => undefined,
});

function flatten(
  items: MenuItemConstructorOptions[],
): MenuItemConstructorOptions[] {
  return items.flatMap((item) => [
    item,
    ...(Array.isArray(item.submenu) ? flatten(item.submenu) : []),
  ]);
}

describe('appMenuTemplate', () => {
  it('has the app menu on macOS only', () => {
    expect(appMenuTemplate('App', actions('darwin', '/d'))[0]?.label).toBe(
      'App',
    );
    expect(appMenuTemplate('App', actions('win32', '/d'))[0]?.label).toBe(
      'File',
    );
  });

  it('binds Open Folder to mod+O and leaves the viewer keys alone', () => {
    const items = flatten(appMenuTemplate('App', actions('win32', '/d')));
    const accelerators = items.flatMap((item) =>
      item.accelerator === undefined ? [] : [item.accelerator],
    );
    expect(accelerators).toEqual(['CmdOrCtrl+O']);
    const labels = items.map((item) => item.label);
    expect(labels).toContain('/other');
  });
});

describe('folderMenuTemplate', () => {
  it('disables folder actions without a folder', () => {
    const items = folderMenuTemplate(actions('darwin', null));
    expect(
      items.find((item) => item.label === 'Reveal in Finder')?.enabled,
    ).toBe(false);
    expect(
      items.find((item) => item.label === 'No recent folders'),
    ).toBeDefined();
  });

  it('ticks the current folder', () => {
    const items = folderMenuTemplate(actions('win32', '/d'));
    expect(items.find((item) => item.label === '/d')?.checked).toBe(true);
    expect(
      items.find((item) => item.label === 'Show in File Explorer'),
    ).toBeDefined();
  });
});
