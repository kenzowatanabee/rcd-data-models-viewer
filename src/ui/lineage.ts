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
