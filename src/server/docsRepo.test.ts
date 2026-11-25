import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checkDocsRepo, listOtherDocs } from './docsRepo';

const made: string[] = [];

function repoWith(files: string[]): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-'));
  made.push(repo);
  for (const file of files) {
    const full = path.join(repo, file);
    if (file.endsWith('/')) {
      fs.mkdirSync(full, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, '# x\n');
    }
  }
  return repo;
}

afterEach(() => {
  for (const repo of made.splice(0)) {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

describe('checkDocsRepo', () => {
  it('accepts a folder with docs/datasets and docs/pipelines', () => {
    expect(checkDocsRepo(repoWith(['docs/datasets/', 'docs/pipelines/']))).toBe(
      null,
    );
  });

  it('says what is missing', () => {
    const repo = repoWith(['docs/datasets/']);
    expect(checkDocsRepo(repo)).toMatch(/docs\/pipelines not found/);
    expect(checkDocsRepo(path.join(repo, 'nope'))).toMatch(/not a folder/);
    expect(checkDocsRepo(path.join(repo, 'docs/datasets/x.md'))).toBe(
      `${path.join(repo, 'docs/datasets/x.md')} is not a folder`,
    );
  });
});

describe('listOtherDocs', () => {
  it('lists the README and top-level docs and guides, sorted', () => {
    const repo = repoWith([
      'README.md',
      'docs/lineage.md',
      'docs/glossary.md',
      'docs/datasets/x.md',
      'docs/notes.txt',
      'guides/a.md',
      'archive/old.md',
    ]);
    expect(listOtherDocs(repo)).toEqual([
      'README.md',
      'docs/glossary.md',
      'docs/lineage.md',
      'guides/a.md',
    ]);
  });
});
