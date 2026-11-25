import { describe, expect, it } from 'vitest';

import { validateDocPath } from './docPath';

describe('validateDocPath', () => {
  it('accepts repo-relative Markdown paths and tidies them', () => {
    expect(validateDocPath('docs/datasets/x.md')).toEqual({
      ok: true,
      file: 'docs/datasets/x.md',
    });
    expect(validateDocPath('README.md')).toEqual({
      ok: true,
      file: 'README.md',
    });
    expect(validateDocPath('./docs//lineage.md')).toEqual({
      ok: true,
      file: 'docs/lineage.md',
    });
  });

  it('rejects traversal and absolute paths', () => {
    for (const file of [
      '../../etc/passwd',
      '../secret.md',
      'docs/../../x.md',
      'docs/../README.md',
      '/etc/passwd.md',
      'C:/Windows/x.md',
      'c:x.md',
      'docs\\..\\..\\x.md',
    ]) {
      expect(validateDocPath(file)).toMatchObject({ ok: false, status: 400 });
    }
  });

  it('rejects .git, non-Markdown files and empty input', () => {
    for (const file of [
      '.git/config',
      '.git/x.md',
      'docs/.GIT/x.md',
      'docs/data.json',
      'docs/',
      'docs/x.md.txt',
      '',
      '  ',
      'a\0.md',
    ]) {
      expect(validateDocPath(file)).toMatchObject({ ok: false, status: 400 });
    }
    expect(validateDocPath(null)).toMatchObject({ ok: false, status: 400 });
  });
});
