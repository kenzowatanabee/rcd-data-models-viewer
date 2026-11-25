import { describe, expect, it } from 'vitest';

import { docHeader } from './docHeaderModel';
import { splitFrontMatter } from './frontMatter';

const header = (yaml: string) =>
  docHeader(splitFrontMatter(`---\n${yaml}\n---\n`).data);

describe('docHeader', () => {
  it('reads a dataset: kind, layer, status, grain, facts and aliases', () => {
    expect(
      header(
        [
          'name: RCD_SORT_REC (flow output)',
          'aliases: [RCD_SORT_REC, RCD_SORT_REC (flow output)]',
          'type: dataset',
          'layer: output   # no documented consumer',
          'platform: Domo',
          'grain: "one row per EAN × CANAL"',
          'status: draft',
          'last_updated: 2026-11-23',
        ].join('\n'),
      ),
    ).toEqual({
      kind: 'dataset',
      layer: { name: 'output', className: 'layer-output' },
      status: { label: 'draft', tone: 'draft' },
      grain: 'one row per EAN × CANAL',
      facts: [
        { label: 'Platform', value: 'Domo', mono: false },
        { label: 'Updated', value: '2026-11-23', mono: false },
      ],
      aliases: ['RCD_SORT_REC'],
    });
  });

  it('reads a pipeline with its Domo id', () => {
    const model = header(
      'name: F\ntype: pipeline\ndomo_id: 6634\nplatform: Domo MagicETL\nstatus: reviewed',
    );
    expect(model.kind).toBe('pipeline');
    expect(model.layer).toBeNull();
    expect(model.status).toEqual({ label: 'reviewed', tone: 'reviewed' });
    expect(model.facts).toContainEqual({
      label: 'Domo id',
      value: '6634',
      mono: true,
    });
  });

  it('maps unknown layers, kinds and statuses to neutral values', () => {
    const model = header('type: report\nlayer: mart\nstatus: deprecated');
    expect(model.kind).toBeNull();
    expect(model.layer?.className).toBe('layer-other');
    expect(model.status?.tone).toBe('other');
  });

  it('is empty without front-matter', () => {
    expect(docHeader(null)).toEqual({
      kind: null,
      layer: null,
      status: null,
      grain: null,
      facts: [],
      aliases: [],
    });
  });
});
