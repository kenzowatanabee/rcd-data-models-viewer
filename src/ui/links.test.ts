import { describe, expect, it } from 'vitest';

import { resolveLink } from './links';

const here = 'docs/datasets/rcd-sort-rec-output.md';

describe('resolveLink', () => {
  it('resolves relative Markdown links against the current file', () => {
    expect(resolveLink(here, '../pipelines/rcd-sort-rec.md')).toEqual({
      kind: 'doc',
      file: 'docs/pipelines/rcd-sort-rec.md',
      anchor: null,
    });
    expect(resolveLink(here, 'other.md')).toEqual({
      kind: 'doc',
      file: 'docs/datasets/other.md',
      anchor: null,
    });
    expect(
      resolveLink(here, '../open-questions.md#q22-rcd_sort_rec-is-long'),
    ).toEqual({
      kind: 'doc',
      file: 'docs/open-questions.md',
      anchor: 'q22-rcd_sort_rec-is-long',
    });
    expect(resolveLink('README.md', 'docs/lineage.md#anchor')).toEqual({
      kind: 'doc',
      file: 'docs/lineage.md',
      anchor: 'anchor',
    });
    expect(resolveLink('guides/x.md', '../../patches/a/README.md')).toEqual({
      kind: 'inert',
      href: '../../patches/a/README.md',
    });
    expect(resolveLink('docs/x/y.md', '../../patches/a/README.md')).toEqual({
      kind: 'doc',
      file: 'patches/a/README.md',
      anchor: null,
    });
  });

  it('treats a leading slash as the repo root and decodes escapes', () => {
    expect(resolveLink(here, '/guides/a%20b.md')).toEqual({
      kind: 'doc',
      file: 'guides/a b.md',
      anchor: null,
    });
  });

  it('keeps in-page anchors in the current doc', () => {
    expect(resolveLink(here, '#overview')).toEqual({
      kind: 'anchor',
      anchor: 'overview',
    });
  });

  it('marks external links', () => {
    expect(resolveLink(here, 'https://github.com/x/y')).toEqual({
      kind: 'external',
      href: 'https://github.com/x/y',
    });
    expect(resolveLink(here, 'mailto:a@b.c')).toMatchObject({
      kind: 'external',
    });
  });

  it('marks repo files the viewer cannot show, and other schemes', () => {
    expect(resolveLink('guides/README.md', '../docs/')).toEqual({
      kind: 'repo-file',
      file: 'docs/',
    });
    expect(resolveLink(here, '../../archive/x.json')).toEqual({
      kind: 'repo-file',
      file: 'archive/x.json',
    });
    expect(resolveLink(here, 'javascript:alert(1)')).toMatchObject({
      kind: 'inert',
    });
    expect(resolveLink(here, '//evil.example/x.md')).toMatchObject({
      kind: 'inert',
    });
    expect(resolveLink(here, '')).toMatchObject({ kind: 'inert' });
  });
});
