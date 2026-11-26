import { describe, expect, it } from 'vitest';

import { folderArg, isTrustedSender, noArgs, pointArg } from './ipc';

describe('IPC argument checks', () => {
  it('noArgs takes nothing', () => {
    expect(noArgs([])).toEqual({ value: null });
    expect(noArgs([1])).toBeNull();
  });

  it('folderArg takes one plain string', () => {
    expect(folderArg(['/docs'])).toEqual({ value: '/docs' });
    for (const args of [
      [],
      [''],
      [1],
      ['/a', '/b'],
      ['/a\0b'],
      ['x'.repeat(5000)],
    ]) {
      expect(folderArg(args)).toBeNull();
    }
  });

  it('pointArg takes { x, y } and nothing else', () => {
    expect(pointArg([{ x: 10.6, y: 3 }])).toEqual({ value: { x: 11, y: 3 } });
    for (const args of [
      [],
      [null],
      [{ x: 1 }],
      [{ x: 1, y: 2, z: 3 }],
      [{ x: Number.NaN, y: 1 }],
      [{ x: -1, y: 1 }],
      [{ x: '1', y: 1 }],
    ]) {
      expect(pointArg(args)).toBeNull();
    }
  });
});

describe('isTrustedSender', () => {
  const APP = 'http://127.0.0.1:4100';
  it('accepts the top frame on the app origin only', () => {
    expect(isTrustedSender(`${APP}/#/graph`, true, APP)).toBe(true);
    expect(isTrustedSender(`${APP}/`, false, APP)).toBe(false);
    expect(isTrustedSender('https://example.com/', true, APP)).toBe(false);
    expect(isTrustedSender('http://127.0.0.1:4101/', true, APP)).toBe(false);
    expect(isTrustedSender(undefined, true, APP)).toBe(false);
    expect(isTrustedSender('garbage', true, APP)).toBe(false);
  });
});
