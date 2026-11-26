import { describe, expect, it } from 'vitest';

import {
  cloneUrlArg,
  folderArg,
  isTrustedSender,
  minutesArg,
  noArgs,
  pointArg,
  switchArgs,
} from './ipc';

describe('IPC argument checks', () => {
  it('switchArgs takes { kind, name } and a literal boolean', () => {
    expect(switchArgs([{ kind: 'local', name: 'docs/a' }, false])).toEqual({
      value: {
        target: { kind: 'local', name: 'docs/a' },
        confirmDetached: false,
      },
    });
    expect(
      switchArgs([{ name: 'main', kind: 'remote' }, true])?.value
        .confirmDetached,
    ).toBe(true);
    for (const args of [
      [],
      [{ kind: 'local', name: 'main' }],
      [{ kind: 'local', name: 'main' }, 'true'],
      [{ kind: 'local', name: 'main' }, 1],
      [{ kind: 'tag', name: 'v1' }, false],
      [{ kind: 'local', name: 'main', extra: 1 }, false],
      [{ kind: 'local' }, false],
      ['main', false],
      [null, false],
      [{ kind: 'local', name: 42 }, false],
      ...[
        '--force',
        '-f',
        '--detach',
        '-c',
        '--orphan=x',
        'a\nb',
        'a\0b',
        'refs/heads/../x',
        '@{-1}',
        'HEAD',
        '',
        'x'.repeat(251),
      ].map((name) => [{ kind: 'local', name }, false]),
    ]) {
      expect(switchArgs(args), JSON.stringify(args)).toBeNull();
    }
  });

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

describe('git arguments', () => {
  it('cloneUrlArg takes one bounded string', () => {
    expect(cloneUrlArg(['https://github.com/o/r'])).toEqual({
      value: 'https://github.com/o/r',
    });
    for (const args of [
      [],
      [''],
      [1],
      ['a', 'b'],
      ['a\0b'],
      ['x'.repeat(3000)],
    ]) {
      expect(cloneUrlArg(args)).toBeNull();
    }
  });

  it('minutesArg takes one offered choice', () => {
    expect(minutesArg([10], [0, 10])).toEqual({ value: 10 });
    for (const args of [[], [7], ['10'], [10, 0], [Number.NaN]]) {
      expect(minutesArg(args, [0, 10])).toBeNull();
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
