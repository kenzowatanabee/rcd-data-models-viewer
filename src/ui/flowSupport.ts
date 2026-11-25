import { diagramType, parseFlowchart, type FlowChart } from './flowParse';
import { styleIssues } from './flowStyle';

export type RendererChoice =
  | { renderer: 'viewer'; chart: FlowChart }
  | {
      renderer: 'mermaid';
      /** Why the viewer does not draw it, for the note on the diagram. */
      reason: string;
    };

/**
 * What in a parsed flowchart the viewer would not draw as Mermaid does:
 * styles it does not support, and links between a subgraph and something
 * inside it. Empty when it can draw all of it.
 */
export function drawIssues(chart: FlowChart): string[] {
  const issues = new Set<string>();
  for (const node of chart.nodes) {
    for (const issue of styleIssues(node.style, 'node')) issues.add(issue);
  }
  for (const sg of chart.subgraphs) {
    for (const issue of styleIssues(sg.style, 'node')) issues.add(issue);
  }
  for (const edge of chart.edges) {
    for (const issue of styleIssues(edge.style, 'edge')) issues.add(issue);
  }
  const parent = new Map<string, string | null>();
  for (const sg of chart.subgraphs) {
    parent.set(sg.id, sg.parent);
    for (const id of sg.nodes) parent.set(id, sg.id);
  }
  const holds = (sg: string, id: string) => {
    let current = parent.get(id) ?? null;
    while (current !== null) {
      if (current === sg) return true;
      current = parent.get(current) ?? null;
    }
    return false;
  };
  for (const edge of chart.edges) {
    if (holds(edge.from, edge.to) || holds(edge.to, edge.from)) {
      issues.add(
        `a link between subgraph and its own content (line ${edge.line})`,
      );
    }
  }
  return [...issues];
}

/**
 * Which renderer draws a diagram. The viewer's, only for a flowchart its
 * parser reads in full and whose every part it can draw; Mermaid for
 * everything else, with the reason.
 */
export function chooseRenderer(source: string): RendererChoice {
  const type = diagramType(source);
  if (type !== 'flowchart' && type !== 'graph') {
    return {
      renderer: 'mermaid',
      reason:
        type === ''
          ? 'the diagram is empty'
          : `the viewer draws flowcharts only; this is a${/^[aeiou]/i.test(type) ? 'n' : ''} ${type}`,
    };
  }
  const parsed = parseFlowchart(source);
  if (!parsed.ok) {
    return {
      renderer: 'mermaid',
      reason: `line ${parsed.line}: the viewer does not read ${parsed.reason}`,
    };
  }
  const issues = drawIssues(parsed.chart);
  if (issues.length > 0) {
    return {
      renderer: 'mermaid',
      reason: `the viewer does not draw ${issues.join(', ')}`,
    };
  }
  return { renderer: 'viewer', chart: parsed.chart };
}
