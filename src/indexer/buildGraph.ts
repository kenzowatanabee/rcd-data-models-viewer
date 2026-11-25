import fs from 'node:fs';
import path from 'node:path';

import { parse as parseYaml } from 'yaml';

import { normaliseName } from './names';
import type {
  DocKind,
  Graph,
  GraphEdge,
  GraphNode,
  OneSidedLink,
  Problem,
  Reference,
  RefField,
} from './types';

export { normaliseName };

const FOLDERS: { dir: string; kind: DocKind }[] = [
  { dir: 'docs/datasets', kind: 'dataset' },
  { dir: 'docs/pipelines', kind: 'pipeline' },
];

/**
 * What each field points at, and which way the data flows:
 * `in` means target -> this doc, `out` means this doc -> target.
 */
const FIELDS: Record<RefField, { target: DocKind; direction: 'in' | 'out' }> = {
  pipeline: { target: 'pipeline', direction: 'in' },
  upstream: { target: 'dataset', direction: 'in' },
  downstream: { target: 'pipeline', direction: 'out' },
  inputs: { target: 'dataset', direction: 'in' },
  outputs: { target: 'dataset', direction: 'out' },
};

/** A dataset <-> pipeline link is declared twice, once on each doc. */
const COUNTERPART: Partial<Record<RefField, RefField>> = {
  inputs: 'downstream',
  downstream: 'inputs',
  outputs: 'pipeline',
  pipeline: 'outputs',
};

const REF_FIELDS = Object.keys(FIELDS) as RefField[];

interface Doc extends GraphNode {
  kind: DocKind;
  file: string;
  refs: Record<RefField, string[]>;
}

function toList(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  const items = Array.isArray(value) ? value : [value];
  return items
    .filter((item) => item !== null && item !== undefined && item !== '')
    .map((item) => String(item).trim());
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  // YAML reads a bare 2026-10-21 as a date
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function readDocs(repo: string, problems: Problem[]): Doc[] {
  const docs: Doc[] = [];
  for (const { dir, kind } of FOLDERS) {
    const folder = path.join(repo, dir);
    if (!fs.existsSync(folder)) {
      throw new Error(`${folder} not found: is ${repo} the data models repo?`);
    }
    const files = fs
      .readdirSync(folder)
      .filter((name) => name.endsWith('.md'))
      .sort();
    for (const name of files) {
      const file = `${dir}/${name}`;
      const text = fs.readFileSync(path.join(folder, name), 'utf8');
      const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
      if (!match) {
        problems.push({ kind: 'no-front-matter', files: [file], detail: '' });
        continue;
      }
      let fm: Record<string, unknown>;
      try {
        const parsed: unknown = parseYaml(match[1] ?? '');
        if (parsed === null || typeof parsed !== 'object') {
          throw new Error('front-matter is not a mapping');
        }
        fm = parsed as Record<string, unknown>;
      } catch (error) {
        const detail = String((error as Error).message).split('\n')[0] ?? '';
        problems.push({ kind: 'bad-yaml', files: [file], detail });
        continue;
      }
      const docName = toText(fm.name);
      if (docName === null) {
        problems.push({ kind: 'missing-name', files: [file], detail: '' });
        continue;
      }
      if (fm.type !== kind) {
        problems.push({
          kind: 'type-vs-folder',
          files: [file],
          detail: `type is ${String(fm.type)} in a ${kind} folder`,
        });
      }
      const body = text.slice(match[0].length);
      docs.push({
        id: file,
        kind,
        name: docName,
        aliases: toList(fm.aliases),
        file,
        title: /^#\s+(.*)$/m.exec(body)?.[1]?.trim() ?? null,
        layer: toText(fm.layer),
        platform: toText(fm.platform),
        status: toText(fm.status),
        domoId: toText(fm.domo_id),
        lastUpdated: toText(fm.last_updated),
        refs: {
          pipeline: toList(fm.pipeline),
          upstream: toList(fm.upstream),
          downstream: toList(fm.downstream),
          inputs: toList(fm.inputs),
          outputs: toList(fm.outputs),
        },
      });
    }
  }
  return docs;
}

type Lookup = Map<string, Set<Doc>>;

function addTo(lookup: Lookup, key: string, doc: Doc): void {
  const docs = lookup.get(key) ?? new Set<Doc>();
  docs.add(doc);
  lookup.set(key, docs);
}

/**
 * Reads the front-matter of every dataset and pipeline doc in a clone of the
 * data models repo and links the docs by the names they give each other.
 * Nothing is guessed: a name two docs share is reported as ambiguous, and a
 * name no doc has becomes an `external` node.
 */
export function buildGraph(repo: string): Graph {
  const problems: Problem[] = [];
  const docs = readDocs(repo, problems);

  const byName: Lookup = new Map();
  const byAlias: Lookup = new Map();
  const byNormalised: Lookup = new Map();
  for (const doc of docs) {
    addTo(byName, doc.name, doc);
    addTo(byNormalised, normaliseName(doc.name), doc);
    for (const alias of doc.aliases) {
      addTo(byAlias, alias, doc);
      addTo(byNormalised, normaliseName(alias), doc);
    }
  }

  // The same name on a dataset and on a pipeline is fine: every field says
  // which kind it means. Two docs of one kind sharing a name is not.
  for (const [name, sameName] of byName) {
    for (const { kind } of FOLDERS) {
      const files = [...sameName]
        .filter((doc) => doc.kind === kind)
        .map((doc) => doc.file);
      if (files.length > 1) {
        problems.push({ kind: 'name-collision', files, detail: name });
      }
    }
  }

  const steps: { lookup: Lookup; status: 'exact' | 'alias' | 'normalised' }[] =
    [
      { lookup: byName, status: 'exact' },
      { lookup: byAlias, status: 'alias' },
      { lookup: byNormalised, status: 'normalised' },
    ];

  const find = (
    ref: string,
    kind: DocKind | null,
  ): Pick<Reference, 'status' | 'target' | 'candidates'> | null => {
    for (const { lookup, status } of steps) {
      const key = status === 'normalised' ? normaliseName(ref) : ref;
      const hits = [...(lookup.get(key) ?? [])].filter(
        (doc) => kind === null || doc.kind === kind,
      );
      if (hits.length === 1) {
        return { status, target: hits[0]?.id ?? null, candidates: [] };
      }
      if (hits.length > 1) {
        return {
          status: 'ambiguous',
          target: null,
          candidates: hits.map((doc) => doc.file).sort(),
        };
      }
    }
    return null;
  };

  const externals = new Map<string, GraphNode>();
  const external = (name: string): string => {
    const id = `external:${name}`;
    if (!externals.has(id)) {
      externals.set(id, {
        id,
        kind: 'external',
        name,
        aliases: [],
        file: null,
        title: null,
        layer: null,
        platform: null,
        status: null,
        domoId: null,
        lastUpdated: null,
      });
    }
    return id;
  };

  const references: Reference[] = [];
  const edges = new Map<string, GraphEdge>();
  // one entry per declared link, to compare the two sides afterwards
  const declared: { from: string; to: string; doc: Doc; field: RefField }[] =
    [];

  for (const doc of docs) {
    for (const field of REF_FIELDS) {
      const { target: wanted, direction } = FIELDS[field];
      for (const ref of doc.refs[field]) {
        let found = find(ref, wanted);
        if (found === null) {
          const otherKind = find(ref, null);
          found =
            otherKind === null
              ? { status: 'unresolved', target: external(ref), candidates: [] }
              : otherKind.status === 'ambiguous'
                ? otherKind
                : { ...otherKind, status: 'wrong-kind' };
        }
        references.push({ file: doc.file, field, ref, ...found });
        if (found.target === null) continue;

        const from = direction === 'in' ? found.target : doc.id;
        const to = direction === 'in' ? doc.id : found.target;
        const key = `${from}\n${to}`;
        const edge = edges.get(key) ?? { from, to, declaredBy: [] };
        edge.declaredBy.push(`${doc.file}#${field}`);
        edges.set(key, edge);
        declared.push({ from, to, doc, field });
      }
    }
  }

  const hasAmbiguous = (file: string, field: RefField): boolean =>
    references.some(
      (reference) =>
        reference.file === file &&
        reference.field === field &&
        reference.status === 'ambiguous',
    );

  const oneSided: OneSidedLink[] = [];
  for (const { from, to, doc, field } of declared) {
    const counterpart = COUNTERPART[field];
    if (counterpart === undefined) continue;
    const otherId = doc.id === from ? to : from;
    if (otherId.startsWith('external:')) continue;
    const mirrored = declared.some(
      (other) =>
        other.from === from &&
        other.to === to &&
        other.field === counterpart &&
        other.doc.id === otherId,
    );
    if (mirrored) continue;
    oneSided.push({
      from,
      to,
      declaredBy: `${doc.file}#${field}`,
      missing: `${otherId}#${counterpart}`,
      uncertain: hasAmbiguous(otherId, counterpart),
    });
  }

  const nodes: GraphNode[] = [
    ...docs.map((doc): GraphNode => {
      const node: Partial<Doc> = { ...doc };
      delete node.refs;
      return node as GraphNode;
    }),
    ...[...externals.values()].sort((a, b) => a.id.localeCompare(b.id)),
  ];

  return { nodes, edges: [...edges.values()], references, oneSided, problems };
}
