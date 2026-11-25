import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildGraph, normaliseName } from './buildGraph';

const made: string[] = [];

/** Writes a small data models repo; keys are paths under `docs/`. */
function repoWith(files: Record<string, string>): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'indexer-'));
  made.push(repo);
  fs.mkdirSync(path.join(repo, 'docs/datasets'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'docs/pipelines'), { recursive: true });
  for (const [file, text] of Object.entries(files)) {
    fs.writeFileSync(path.join(repo, 'docs', file), text);
  }
  return repo;
}

const dataset = (frontMatter: string, title = 'A dataset') =>
  `---\n${frontMatter}\ntype: dataset\n---\n\n# ${title}\n\nBody.\n`;
const pipeline = (frontMatter: string) =>
  `---\n${frontMatter}\ntype: pipeline\n---\n\n# A pipeline\n`;

afterEach(() => {
  for (const repo of made.splice(0)) {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

describe('buildGraph', () => {
  it('links a source through a pipeline to its output', () => {
    const graph = buildGraph(
      repoWith({
        'datasets/raw.md': dataset('name: RAW\ndownstream: [FLOW]'),
        'datasets/out.md': dataset(
          'name: OUT\npipeline: FLOW\nupstream: [RAW]\nlayer: output\nlast_updated: 2026-10-21',
          '`OUT`: the output',
        ),
        'pipelines/flow.md': pipeline(
          'name: FLOW\ndomo_id: 123\ninputs: [RAW]\noutputs: [OUT]',
        ),
      }),
    );

    expect(graph.problems).toEqual([]);
    expect(graph.oneSided).toEqual([]);
    expect(graph.references.map((r) => r.status)).toEqual(
      Array(5).fill('exact'),
    );
    const edges = graph.edges.map((edge) => `${edge.from} > ${edge.to}`);
    expect(edges.sort()).toEqual([
      'docs/datasets/raw.md > docs/datasets/out.md',
      'docs/datasets/raw.md > docs/pipelines/flow.md',
      'docs/pipelines/flow.md > docs/datasets/out.md',
    ]);
    // declared on both docs, kept as one edge
    expect(
      graph.edges.find((edge) => edge.to === 'docs/pipelines/flow.md')
        ?.declaredBy,
    ).toEqual([
      'docs/datasets/raw.md#downstream',
      'docs/pipelines/flow.md#inputs',
    ]);

    const out = graph.nodes.find((node) => node.name === 'OUT');
    expect(out).toMatchObject({
      id: 'docs/datasets/out.md',
      kind: 'dataset',
      title: '`OUT`: the output',
      layer: 'output',
      lastUpdated: '2026-10-21',
    });
    expect(graph.nodes.find((node) => node.name === 'FLOW')?.domoId).toBe(
      '123',
    );
  });

  it('resolves aliases and spelling differences, and says which it used', () => {
    const graph = buildGraph(
      repoWith({
        'datasets/a.md': dataset(
          'name: RCD_DISTRIBUIÇÃO\naliases: [Distribution]',
        ),
        'datasets/b.md': dataset(
          'name: B\nupstream: [Distribution, rcd distribuicao]',
        ),
      }),
    );
    expect(graph.references.map((r) => [r.ref, r.status, r.target])).toEqual([
      ['Distribution', 'alias', 'docs/datasets/a.md'],
      ['rcd distribuicao', 'normalised', 'docs/datasets/a.md'],
    ]);
    expect(graph.edges).toHaveLength(1);
  });

  it('prefers the doc named X over a doc that only has X as an alias', () => {
    const graph = buildGraph(
      repoWith({
        'datasets/sheet.md': dataset('name: SORT_REC'),
        'datasets/output.md': dataset(
          'name: SORT_REC (flow output)\naliases: [SORT_REC]\nupstream: [SORT_REC]',
        ),
      }),
    );
    expect(graph.problems).toEqual([]);
    expect(graph.references).toEqual([
      expect.objectContaining({
        status: 'exact',
        target: 'docs/datasets/sheet.md',
      }),
    ]);
  });

  it('draws a name no doc has as an external node', () => {
    const graph = buildGraph(
      repoWith({
        'pipelines/flow.md': pipeline('name: FLOW\ninputs: [HUB.SALES]'),
        'datasets/b.md': dataset('name: B\nupstream: [HUB.SALES]'),
      }),
    );
    expect(graph.nodes.filter((node) => node.kind === 'external')).toEqual([
      expect.objectContaining({ id: 'external:HUB.SALES', file: null }),
    ]);
    expect(graph.references.every((r) => r.status === 'unresolved')).toBe(true);
    expect(graph.edges.map((edge) => edge.from)).toEqual([
      'external:HUB.SALES',
      'external:HUB.SALES',
    ]);
  });

  it('does not pick between two datasets with the same name', () => {
    const graph = buildGraph(
      repoWith({
        'datasets/sort-rec.md': dataset('name: SORT_REC'),
        'datasets/sort-rec-output.md': dataset('name: SORT_REC'),
        'pipelines/flow.md': pipeline('name: FLOW\ninputs: [SORT_REC]'),
      }),
    );
    expect(graph.references).toEqual([
      {
        file: 'docs/pipelines/flow.md',
        field: 'inputs',
        ref: 'SORT_REC',
        status: 'ambiguous',
        target: null,
        candidates: [
          'docs/datasets/sort-rec-output.md',
          'docs/datasets/sort-rec.md',
        ],
      },
    ]);
    expect(graph.edges).toEqual([]);
    expect(graph.problems).toEqual([
      {
        kind: 'name-collision',
        files: [
          'docs/datasets/sort-rec-output.md',
          'docs/datasets/sort-rec.md',
        ],
        detail: 'SORT_REC',
      },
    ]);
  });

  it('tells a dataset from a pipeline of the same name by the field', () => {
    const graph = buildGraph(
      repoWith({
        'datasets/pos-base.md': dataset('name: POS_BASE\npipeline: POS_BASE'),
        'pipelines/pos-base.md': pipeline(
          'name: POS_BASE\noutputs: [POS_BASE]',
        ),
      }),
    );
    expect(graph.problems).toEqual([]);
    expect(graph.oneSided).toEqual([]);
    expect(graph.edges).toEqual([
      {
        from: 'docs/pipelines/pos-base.md',
        to: 'docs/datasets/pos-base.md',
        declaredBy: [
          'docs/datasets/pos-base.md#pipeline',
          'docs/pipelines/pos-base.md#outputs',
        ],
      },
    ]);
  });

  it('flags a reference that names a doc of the wrong kind', () => {
    const graph = buildGraph(
      repoWith({
        'datasets/a.md': dataset('name: A'),
        'datasets/b.md': dataset('name: B\ndownstream: [A]'),
      }),
    );
    expect(graph.references[0]).toMatchObject({
      status: 'wrong-kind',
      target: 'docs/datasets/a.md',
    });
  });

  it('reports a link only one of the two docs declares', () => {
    const graph = buildGraph(
      repoWith({
        'datasets/raw.md': dataset('name: RAW\ndownstream: [FLOW]'),
        'pipelines/flow.md': pipeline('name: FLOW\ninputs: []'),
      }),
    );
    expect(graph.oneSided).toEqual([
      {
        from: 'docs/datasets/raw.md',
        to: 'docs/pipelines/flow.md',
        declaredBy: 'docs/datasets/raw.md#downstream',
        missing: 'docs/pipelines/flow.md#inputs',
        uncertain: false,
      },
    ]);
  });

  it('marks a one-sided link uncertain when the other side is ambiguous', () => {
    const graph = buildGraph(
      repoWith({
        'datasets/one.md': dataset('name: SAME\ndownstream: [FLOW]'),
        'datasets/two.md': dataset('name: SAME'),
        'pipelines/flow.md': pipeline('name: FLOW\ninputs: [SAME]'),
      }),
    );
    expect(graph.oneSided).toHaveLength(1);
    expect(graph.oneSided[0]?.uncertain).toBe(true);
  });

  it('reads block lists, empty fields and yaml comments', () => {
    const graph = buildGraph(
      repoWith({
        'datasets/a.md': dataset('name: A'),
        'datasets/b.md': dataset('name: B'),
        'pipelines/flow.md': pipeline(
          'name: FLOW\ninputs:\n  - A   # since 2026\n  - B\noutputs:\naliases: []',
        ),
      }),
    );
    expect(graph.references.map((r) => r.ref)).toEqual(['A', 'B']);
  });

  it('reports docs it cannot read instead of stopping', () => {
    const graph = buildGraph(
      repoWith({
        'datasets/plain.md': '# No front-matter\n',
        'datasets/broken.md': '---\nname: [unclosed\n---\n\n# Broken\n',
        'datasets/nameless.md': dataset('layer: source'),
        'datasets/misfiled.md': pipeline('name: MISFILED'),
        'datasets/good.md': dataset('name: GOOD'),
        'datasets/notes.txt': 'ignored',
      }),
    );
    expect(graph.problems.map((p) => [p.kind, p.files[0]])).toEqual([
      ['bad-yaml', 'docs/datasets/broken.md'],
      ['type-vs-folder', 'docs/datasets/misfiled.md'],
      ['missing-name', 'docs/datasets/nameless.md'],
      ['no-front-matter', 'docs/datasets/plain.md'],
    ]);
    expect(graph.nodes.map((node) => node.name)).toEqual(['GOOD', 'MISFILED']);
  });

  it('fails clearly when the path is not the data models repo', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'indexer-'));
    made.push(empty);
    expect(() => buildGraph(empty)).toThrow(/is .* the data models repo\?/);
  });
});

describe('normaliseName', () => {
  it('ignores case, accents, backticks and separators', () => {
    expect(normaliseName(' `RCD_ATACADÃO  Norte` ')).toBe('rcd_atacadao_norte');
    expect(normaliseName('RCD_MASTER-DISTRIBUTION_NIQ')).toBe(
      'rcd_master_distribution_niq',
    );
  });
});
