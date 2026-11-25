import { describe, expect, it } from 'vitest';

import type { Graph, GraphNode } from '../indexer/types';
import {
  SECTION_IDS,
  checklist,
  healthReport,
  issueCount,
  issuesByFile,
  sectionCount,
  sectionLines,
} from './health';

const node = (
  id: string,
  kind: GraphNode['kind'],
  over: Partial<GraphNode> = {},
): GraphNode => ({
  id,
  kind,
  name: id.replace(/^.*\//, '').replace(/\.md$/, '').toUpperCase(),
  aliases: [],
  file: kind === 'external' ? null : id,
  title: null,
  layer: null,
  platform: null,
  status: 'draft',
  domoId: null,
  lastUpdated: null,
  ...over,
});

const A = 'docs/datasets/a.md';
const B = 'docs/datasets/b.md';
const C = 'docs/datasets/c.md';
const LONE = 'docs/datasets/lone.md';
const P = 'docs/pipelines/p.md';
const Q = 'docs/pipelines/q.md';
const EXT = 'external:RAW';

const graph: Graph = {
  nodes: [
    node(A, 'dataset', { lastUpdated: '2026-01-02' }),
    node(B, 'dataset', { lastUpdated: '2025-05-01', status: 'reviewed' }),
    node(C, 'dataset', { lastUpdated: '2026-03-01' }),
    node(LONE, 'dataset', { layer: 'source' }),
    node(P, 'pipeline', { lastUpdated: '2026-02-01' }),
    node(Q, 'pipeline'),
    node(EXT, 'external', { name: 'RAW', status: null }),
  ],
  edges: [
    { from: EXT, to: A, declaredBy: [`${A}#upstream`, `${C}#upstream`] },
    { from: A, to: P, declaredBy: [`${P}#inputs`] },
    { from: P, to: B, declaredBy: [`${P}#outputs`] },
    // Redundant: P already reads A and writes B
    { from: A, to: B, declaredBy: [`${B}#upstream`] },
    // Direct, with no pipeline behind it
    { from: B, to: C, declaredBy: [`${C}#upstream`] },
    { from: EXT, to: C, declaredBy: [`${C}#upstream`] },
    { from: C, to: Q, declaredBy: [`${Q}#inputs`] },
  ],
  references: [
    {
      file: A,
      field: 'upstream',
      ref: 'RAW',
      status: 'unresolved',
      target: EXT,
      candidates: [],
    },
    {
      file: C,
      field: 'upstream',
      ref: 'raw',
      status: 'unresolved',
      target: EXT,
      candidates: [],
    },
    {
      file: Q,
      field: 'inputs',
      ref: 'SHARED',
      status: 'ambiguous',
      target: null,
      candidates: [B, A],
    },
    {
      file: P,
      field: 'inputs',
      ref: 'SHARED',
      status: 'ambiguous',
      target: null,
      candidates: [A, B],
    },
    {
      file: B,
      field: 'pipeline',
      ref: 'C',
      status: 'wrong-kind',
      target: C,
      candidates: [],
    },
    {
      file: B,
      field: 'upstream',
      ref: 'A',
      status: 'exact',
      target: A,
      candidates: [],
    },
  ],
  oneSided: [
    {
      from: P,
      to: B,
      declaredBy: `${P}#outputs`,
      missing: `${B}#pipeline`,
      uncertain: false,
    },
  ],
  problems: [
    { kind: 'bad-yaml', files: ['docs/datasets/x.md'], detail: 'bad indent' },
  ],
};

describe('healthReport', () => {
  const report = healthReport(graph);

  it('groups undocumented names with their mentions and downstream reach', () => {
    expect(report.undocumented).toEqual([
      {
        id: EXT,
        name: 'RAW',
        mentions: [
          { file: A, field: 'upstream', name: 'A' },
          { file: C, field: 'upstream', name: 'C' },
        ],
        // A, P, B, C, Q
        downstream: 5,
      },
    ]);
    expect(report.unresolvedCount).toBe(2);
  });

  it('groups ambiguous names whatever the order of candidates', () => {
    expect(report.ambiguous).toHaveLength(1);
    expect(report.ambiguous[0]?.candidates.map((c) => c.file)).toEqual([A, B]);
    expect(report.ambiguous[0]?.mentions.map((m) => m.file)).toEqual([Q, P]);
  });

  it('lists wrong-kind references with what was expected', () => {
    expect(report.wrongKind).toMatchObject([
      { ref: 'C', expected: 'pipeline', actual: 'dataset' },
    ]);
  });

  it('describes one-sided links by the field to add', () => {
    expect(report.oneSided).toMatchObject([
      {
        declared: { file: P, field: 'outputs', name: 'P' },
        missing: { file: B, field: 'pipeline', name: 'B' },
      },
    ]);
  });

  it('finds unlinked datasets and direct links with no pipeline', () => {
    expect(report.unlinked.map((n) => n.id)).toEqual([LONE]);
    expect(report.directLinks).toEqual([
      {
        from: { id: B, file: B, name: 'B' },
        to: { id: C, file: C, name: 'C' },
        declaredBy: [{ file: C, field: 'upstream', name: 'C' }],
      },
    ]);
  });

  it('counts statuses and lists the oldest docs first', () => {
    expect(report.status).toEqual([
      { kind: 'dataset', draft: 3, reviewed: 1, other: 0, none: 0 },
      { kind: 'pipeline', draft: 2, reviewed: 0, other: 0, none: 0 },
    ]);
    expect(report.oldest.map((d) => d.id)).toEqual([B, A, P, C]);
    expect(report.undated.map((d) => d.id)).toEqual([LONE, Q]);
  });

  it('adds what to change to each problem', () => {
    expect(report.problems[0]?.fix).toMatch(/YAML/);
  });

  it('counts the to-do items', () => {
    expect(SECTION_IDS.map((id) => sectionCount(report, id))).toEqual([
      1, 1, 1, 1, 1, 1, 1, 0,
    ]);
    expect(issueCount(report)).toBe(7);
  });

  it('says all is well on a clean graph', () => {
    const clean = healthReport({
      nodes: [node(A, 'dataset'), node(P, 'pipeline')],
      edges: [
        { from: A, to: P, declaredBy: [`${A}#downstream`, `${P}#inputs`] },
      ],
      references: [],
      oneSided: [],
      problems: [],
    });
    expect(issueCount(clean)).toBe(0);
    expect(checklist(clean, 'undocumented')).toBe(
      '## Undocumented names\n\nNothing to do.\n',
    );
  });
});

describe('checklist', () => {
  it('writes one Markdown to-do per item', () => {
    const report = healthReport(graph);
    expect(checklist(report, 'one-sided')).toBe(
      [
        '## One-sided links',
        '',
        `- [ ] ${B}: add \`P\` to \`pipeline\` (declared by ${P} \`outputs\`).`,
        '',
      ].join('\n'),
    );
    expect(sectionLines(report, 'undocumented')).toEqual([
      `Document \`RAW\` (5 downstream): named in ${A} \`upstream\`, ${C} \`upstream\`.`,
    ]);
  });
});

describe('issuesByFile', () => {
  it('counts the to-do lines that name each file, as the filter would', () => {
    const report = healthReport(graph);
    const counts = issuesByFile(report, [A, B, C, LONE, P, Q]);
    for (const [file, count] of counts) {
      const matching = SECTION_IDS.filter((id) => id !== 'status').flatMap(
        (id) => sectionLines(report, id).filter((line) => line.includes(file)),
      );
      expect(count).toBe(matching.length);
    }
    expect(counts.get(B)).toBeGreaterThan(0);
    // A file named nowhere gets no entry
    expect(issuesByFile(report, ['docs/nowhere.md']).size).toBe(0);
  });
});
