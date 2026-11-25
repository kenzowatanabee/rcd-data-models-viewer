import type {
  Graph,
  GraphNode,
  OneSidedLink,
  Reference,
} from '../indexer/types';

export interface Neighbour {
  node: GraphNode;
  /** Front-matter fields that declare the edge, as `file#field`. */
  declaredBy: string[];
}

export interface Neighbours {
  upstream: Neighbour[];
  downstream: Neighbour[];
}

const byName = (a: Neighbour, b: Neighbour) =>
  a.node.name.localeCompare(b.node.name);

/** Direct neighbours of a node: what flows into it and what it feeds. */
export function neighbours(graph: Graph, id: string): Neighbours {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const upstream: Neighbour[] = [];
  const downstream: Neighbour[] = [];
  for (const edge of graph.edges) {
    if (edge.to === id) {
      const node = nodes.get(edge.from);
      if (node) upstream.push({ node, declaredBy: edge.declaredBy });
    }
    if (edge.from === id) {
      const node = nodes.get(edge.to);
      if (node) downstream.push({ node, declaredBy: edge.declaredBy });
    }
  }
  return {
    upstream: upstream.sort(byName),
    downstream: downstream.sort(byName),
  };
}

export interface Gaps {
  oneSided: OneSidedLink[];
  /** Ambiguous, unresolved and wrong-kind references made by or naming this doc. */
  references: Reference[];
}

const GAP_STATUSES = new Set<Reference['status']>([
  'ambiguous',
  'unresolved',
  'wrong-kind',
]);

/** `docs/x.md#field` -> `docs/x.md` */
const fileOf = (declared: string) => declared.replace(/#[^#]*$/, '');

/** Lineage gaps the maintainer of `file` may want to fix. */
export function gapsFor(graph: Graph, file: string): Gaps {
  return {
    oneSided: graph.oneSided.filter(
      (link) =>
        link.from === file ||
        link.to === file ||
        fileOf(link.declaredBy) === file ||
        fileOf(link.missing) === file,
    ),
    references: graph.references.filter(
      (reference) =>
        GAP_STATUSES.has(reference.status) &&
        (reference.file === file ||
          reference.target === file ||
          reference.candidates.includes(file)),
    ),
  };
}

export interface DocRef {
  file: string;
  field: string;
  /** The doc's `name`, or its path when the graph does not know it. */
  name: string;
}

/** A one-sided link, as the two docs and fields involved. */
export interface OneSidedGap {
  /** The doc and field that declare the link. */
  declared: DocRef;
  /** The doc and field that should declare it too. */
  missing: DocRef;
  uncertain: boolean;
}

const KIND_OF_FIELD: Record<string, 'dataset' | 'pipeline'> = {
  pipeline: 'pipeline',
  upstream: 'dataset',
  downstream: 'pipeline',
  inputs: 'dataset',
  outputs: 'dataset',
};

function split(declared: string): { file: string; field: string } {
  const cut = declared.lastIndexOf('#');
  return cut === -1
    ? { file: declared, field: '' }
    : { file: declared.slice(0, cut), field: declared.slice(cut + 1) };
}

const nameOf = (graph: Graph, file: string) =>
  graph.nodes.find((node) => node.id === file)?.name ?? file;

export function describeOneSided(
  graph: Graph,
  link: OneSidedLink,
): OneSidedGap {
  const declared = split(link.declaredBy);
  const missing = split(link.missing);
  return {
    declared: { ...declared, name: nameOf(graph, declared.file) },
    missing: { ...missing, name: nameOf(graph, missing.file) },
    uncertain: link.uncertain,
  };
}

export interface ReferenceGap {
  status: 'ambiguous' | 'unresolved' | 'wrong-kind';
  ref: string;
  /** Where the name is written. */
  at: DocRef;
  /** What the field should name. */
  expected: 'dataset' | 'pipeline' | null;
  /** What the name matched instead, for wrong-kind. */
  actual: string | null;
  candidates: { file: string; name: string }[];
}

export function describeReference(
  graph: Graph,
  reference: Reference,
): ReferenceGap {
  const target =
    reference.target === null
      ? undefined
      : graph.nodes.find((node) => node.id === reference.target);
  return {
    status:
      reference.status === 'ambiguous' || reference.status === 'wrong-kind'
        ? reference.status
        : 'unresolved',
    ref: reference.ref,
    at: {
      file: reference.file,
      field: reference.field,
      name: nameOf(graph, reference.file),
    },
    expected: KIND_OF_FIELD[reference.field] ?? null,
    actual: reference.status === 'wrong-kind' ? (target?.kind ?? null) : null,
    candidates: reference.candidates.map((file) => ({
      file,
      name: nameOf(graph, file),
    })),
  };
}
