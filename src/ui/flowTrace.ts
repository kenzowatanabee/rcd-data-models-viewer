import type { GraphNode } from '../indexer/types';
import { normaliseName } from '../indexer/names';
import { plainText, type LabelLine } from './flowLabel';
import type { FlowChart } from './flowParse';
import { edgeKey, trace } from './graphModel';

export interface FlowTrace {
  root: string;
  upstream: Set<string>;
  downstream: Set<string>;
  /** Edge indexes on the way up and down. */
  upstreamEdges: Set<number>;
  downstreamEdges: Set<number>;
}

/**
 * Everything upstream and downstream of a node, following the links, as on
 * the lineage graph. A link from a subgraph counts as a link from each node
 * in it, and a link to a subgraph as one to each node in it.
 */
export function traceFlow(chart: FlowChart, root: string): FlowTrace {
  const descendants = new Map<string, string[]>();
  const collect = (id: string): string[] => {
    const sg = chart.subgraphs.find((s) => s.id === id);
    if (sg === undefined) return [];
    return [...sg.nodes, ...sg.subgraphs.flatMap(collect)];
  };
  for (const sg of chart.subgraphs) descendants.set(sg.id, collect(sg.id));

  // A subgraph is two points: where links into it arrive and fan out to
  // its nodes, and where its nodes gather for links out of it; one point
  // would make its nodes upstream of each other
  const inOf = (sg: string) => `${sg}\u0000in`;
  const outOf = (sg: string) => `${sg}\u0000out`;
  const links = chart.edges.map((e) => ({
    from: descendants.has(e.from) ? outOf(e.from) : e.from,
    to: descendants.has(e.to) ? inOf(e.to) : e.to,
  }));
  const extra: { from: string; to: string }[] = [];
  for (const [sg, members] of descendants) {
    for (const member of members) {
      extra.push({ from: member, to: outOf(sg) });
      extra.push({ from: inOf(sg), to: member });
    }
  }
  const nodes = chart.nodes.map((n) => ({
    id: n.id,
    kind: 'dataset' as const,
  }));
  const result = trace({ nodes, edges: [...links, ...extra] }, root);
  const real = (ids: Iterable<string>) =>
    new Set([...ids].filter((id) => !id.includes('\u0000')));
  const up = real(result.upstream.keys());
  const down = real(result.downstream.keys());
  const upstreamEdges = new Set<number>();
  const downstreamEdges = new Set<number>();
  links.forEach((link, index) => {
    const key = edgeKey(link);
    if (result.upstreamEdges.has(key)) upstreamEdges.add(index);
    if (result.downstreamEdges.has(key)) downstreamEdges.add(index);
  });
  return {
    root,
    upstream: up,
    downstream: down,
    upstreamEdges,
    downstreamEdges,
  };
}

/**
 * Finds the documented dataset or pipeline a node's label names: its first
 * line, normalised as the indexer does, against every doc's name and
 * aliases. A name two docs share links nowhere.
 */
export function docLinker(
  graphNodes: readonly GraphNode[],
): (label: LabelLine[]) => GraphNode | null {
  const byName = new Map<string, Set<GraphNode>>();
  for (const node of graphNodes) {
    if (node.kind === 'external' || node.file === null) continue;
    for (const name of [node.name, ...node.aliases]) {
      const key = normaliseName(name);
      if (key === '') continue;
      const set = byName.get(key) ?? new Set();
      set.add(node);
      byName.set(key, set);
    }
  }
  return (label) => {
    const first = plainText(label.slice(0, 1));
    const found = byName.get(normaliseName(first));
    if (found === undefined || found.size !== 1) return null;
    return [...found][0] ?? null;
  };
}
