/**
 * Our flowchart parser against Mermaid's: for every flowchart in the docs
 * (copied into fixtures/mermaid) and for small snippets of each feature,
 * both must see the same nodes, labels, shapes, links, classes, styles and
 * subgraphs. Mermaid needs a DOM for its sanitiser, so jsdom provides one.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';
import type { Mermaid } from 'mermaid';
import { beforeAll, describe, expect, it } from 'vitest';

import type { LabelLine } from './flowLabel';
import { diagramType, parseFlowchart, type FlowChart } from './flowParse';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
let mermaid: Mermaid;

beforeAll(async () => {
  const scope = globalThis as unknown as Record<string, unknown>;
  scope.window = dom.window;
  scope.document = dom.window.document;
  mermaid = (await import('mermaid')).default;
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
}, 60_000);

/** Mermaid's parse, as plain data. */
interface Vertex {
  text?: string;
  type?: string;
  classes?: string[];
  styles?: string[];
}
interface MermaidEdge {
  start: string;
  end: string;
  type?: string;
  text?: string;
  stroke?: string;
  length?: number;
  style?: string[];
}
interface MermaidSubgraph {
  id: string;
  title: string;
  nodes: string[];
  dir?: string;
}
interface FlowDb {
  getVertices(): Map<string, Vertex>;
  getEdges(): MermaidEdge[] & { defaultStyle?: string[] };
  getSubGraphs(): MermaidSubgraph[];
  getClasses(): Map<string, { styles: string[] }>;
  getDirection(): string;
}

/** A label as one string: lines joined by \n, *italic*, **bold**. */
function serialise(lines: LabelLine[]): string {
  return lines
    .map((line) =>
      line
        .map((run) => {
          let text = run.text.replace(/ /g, ' ');
          if (run.italic) text = `*${text}*`;
          if (run.bold) text = `**${text}**`;
          return text;
        })
        .join(''),
    )
    .join('\n');
}

/** Mermaid's label text (HTML with its entity placeholders) the same way. */
function serialiseHtml(html: string): string {
  const decoded = html
    .replace(/ﬂ°°(\d+)¶ß/g, '&#$1;')
    .replace(/ﬂ°(\w+)¶ß/g, '&$1;');
  const box = dom.window.document.createElement('div');
  box.innerHTML = decoded;
  const lines: LabelLine[] = [[]];
  const walk = (node: Node, italic: boolean, bold: boolean) => {
    if (node.nodeType === 3) {
      (lines[lines.length - 1] as LabelLine).push({
        text: node.textContent ?? '',
        italic,
        bold,
      });
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = (node as Element).tagName.toLowerCase();
    if (tag === 'br') {
      lines.push([]);
      return;
    }
    for (const child of node.childNodes) {
      walk(
        child,
        italic || tag === 'i' || tag === 'em',
        bold || tag === 'b' || tag === 'strong',
      );
    }
  };
  walk(box, false, false);
  // Whitespace as HTML shows it, then merged runs, as parseLabel does
  return serialise(
    lines.map((line) => {
      const merged: LabelLine = [];
      for (const run of line) {
        const last = merged[merged.length - 1];
        if (last && last.italic === run.italic && last.bold === run.bold) {
          last.text += run.text;
        } else merged.push({ ...run });
      }
      let text = merged.map((r) => r.text.replace(/[ \t\r\n]+/g, ' '));
      text = text.map((t, i) =>
        i === 0 || text[i - 1]?.endsWith(' ') ? t.replace(/^ /, '') : t,
      );
      const last = text.length - 1;
      if (last >= 0) text[last] = (text[last] as string).replace(/ $/, '');
      return merged
        .map((run, i) => ({ ...run, text: text[i] as string }))
        .filter((run) => run.text !== '');
    }),
  );
}

const SHAPES: Record<string, string> = {
  square: 'rect',
  round: 'round',
  stadium: 'stadium',
  subroutine: 'subroutine',
  cylinder: 'cylinder',
  circle: 'circle',
  doublecircle: 'doublecircle',
  diamond: 'diamond',
  hexagon: 'hexagon',
  lean_right: 'lean_right',
  lean_left: 'lean_left',
  trapezoid: 'trapezoid',
  inv_trapezoid: 'inv_trapezoid',
  odd: 'odd',
};

const END_TYPES = {
  arrow: 'arrow_point',
  none: 'arrow_open',
  cross: 'arrow_cross',
  circle: 'arrow_circle',
} as const;

const withoutFillNone = (styles: string[]) =>
  styles.map((s) => s.trim()).filter((s) => s !== 'fill:none' && s !== '');

async function theirs(source: string) {
  const diagram = await mermaid.mermaidAPI.getDiagramFromText(source);
  const db = diagram.db as unknown as FlowDb;
  const subgraphs = db.getSubGraphs();
  const sgIds = new Set(subgraphs.map((sg) => sg.id));
  const edges = db.getEdges();
  return {
    direction: db.getDirection().replace('TD', 'TB'),
    nodes: [...db.getVertices().entries()]
      .filter(([id]) => !sgIds.has(id))
      .map(([id, v]) => ({
        id,
        label: serialiseHtml(v.text ?? id),
        shape: v.type === undefined ? 'rect' : (SHAPES[v.type] ?? v.type),
        classes: [...(v.classes ?? [])].sort(),
        styles: withoutFillNone(v.styles ?? []),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.map((e) => ({
      from: e.start,
      to: e.end,
      label: serialiseHtml(e.text ?? ''),
      type: e.type,
      stroke: e.stroke,
      length: e.length,
      style: withoutFillNone([
        ...(edges.defaultStyle ?? []),
        ...(e.style ?? []),
      ]),
    })),
    subgraphs: subgraphs
      .map((sg) => ({
        id: sg.id,
        title: serialiseHtml(sg.title),
        members: [...sg.nodes].sort(),
        direction: sg.dir ?? null,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    classDefs: [...db.getClasses().entries()]
      .map(([name, def]) => ({ name, styles: withoutFillNone(def.styles) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function ours(chart: FlowChart) {
  const decl = (d: { property: string; value: string }) =>
    `${d.property}:${d.value}`;
  return {
    direction: chart.direction,
    nodes: chart.nodes
      .map((n) => ({
        id: n.id,
        label: serialise(n.label),
        shape: n.shape,
        classes: [...n.classes].sort(),
        styles: n.ownStyles.map(decl),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    edges: chart.edges.map((e) => ({
      from: e.from,
      to: e.to,
      label: e.label === null ? '' : serialise(e.label),
      type: (e.start === 'none' ? '' : 'double_') + END_TYPES[e.end],
      stroke: e.stroke,
      length: e.length,
      style: withoutFillNone(e.style.map(decl)),
    })),
    subgraphs: chart.subgraphs
      .map((sg) => ({
        id: sg.id,
        title: serialise(sg.title),
        members: [...sg.nodes, ...sg.subgraphs].sort(),
        direction: sg.direction,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    classDefs: [...chart.classDefs.entries()]
      .map(([name, decls]) => ({ name, styles: decls.map(decl) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

async function expectSameAsMermaid(source: string): Promise<void> {
  const parsed = parseFlowchart(source);
  if (!parsed.ok) {
    throw new Error(`unsupported: ${parsed.reason} at line ${parsed.line}`);
  }
  expect(ours(parsed.chart)).toEqual(await theirs(source));
}

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/mermaid',
);
const sources = readdirSync(fixtures)
  .filter((name) => name.endsWith('.mmd'))
  .sort()
  .map((name) => ({
    name,
    source: readFileSync(path.join(fixtures, name), 'utf8'),
  }));
const flowcharts = sources.filter(({ source }) =>
  ['flowchart', 'graph'].includes(diagramType(source)),
);

describe('the docs’ flowcharts parse as Mermaid parses them', () => {
  it('has the 35 flowcharts of the docs', () => {
    expect(sources).toHaveLength(36);
    expect(flowcharts).toHaveLength(35);
  });

  it.each(flowcharts)('$name', async ({ source }) => {
    await expectSameAsMermaid(source);
  });
});

describe('each supported feature parses as Mermaid parses it', () => {
  const snippets: Record<string, string> = {
    shapes: `flowchart TD
      a[rect] --> b(round) --> c([stadium]) --> d[[sub]]
      d --> e[(cyl)] --> f((circle)) --> g{diamond} --> h{{hex}}
      h --> i>odd] --> j[/lean right/] --> k[\\lean left\\]
      k --> l[/trap\\] --> m[\\inv trap/] --> n(((double)))`,
    'quoted labels and html': `flowchart LR
      a["one<br/>two <i>three</i>"] --> b["<b>bold</b> and<br>more"]
      c["say #quot;hi#quot; #35; &amp; &lt;x&gt;"] --> d["  spaced   out  "]`,
    'link kinds': `flowchart LR
      a --> b
      a --- c
      a -.-> d
      a -.- e
      a ==> f
      a === g
      a ---> h
      a -----> i
      a -..-> j
      a ===> k
      a <--> l
      a x--x m
      a o--o n
      a --x o1
      a --o p1`,
    'link labels': `flowchart LR
      a -- text --> b
      a -->|pipe| c
      a -->|"quoted |pipe|"| d
      a -. dotted text .-> e
      a == thick text ==> f
      a -->|Filter YYYYMM >= 202201 & NOT NULL| g
      a -->|SALES_VOL->SALES_UNIT, X->Y| h
      a -. "disabled 2026-10-26" .-> i
      a -- "text with -- dashes" --> j`,
    'chains and fan-out': `flowchart TD
      a --> b --> c
      a & b --> c & d
      e --> f & g --> h`,
    subgraphs: `flowchart LR
      subgraph one ["First"]
        direction TB
        a
        b --> c
      end
      subgraph two [Second]
        subgraph inner ["Inner"]
          d
        end
        e --> d
        a
      end
      one --> two
      c --> f`,
    'classes and styles': `flowchart LR
      classDef pipe fill:#e8f0fe,stroke:#4a6fa5,color:#1a2b45;
      classDef stop fill:#fdecea,stroke:#c0392b,stroke-width:2px,stroke-dasharray:4 3;
      a:::pipe --> b
      b --> c
      class b,c stop;
      style a fill:#fff,color:#000
      linkStyle 0,1 stroke:#c0392b,stroke-dasharray:6 4;`,
    'comments, directives and semicolons': `%%{init: {"theme": "base"}}%%
      graph TD;
      %% a comment
      a-->b;b-->c
      a[A again];`,
    'unicode and redeclared nodes': `flowchart TD
      ação[RCD_ATACADÃO] --> b
      b[first] --> c
      b[second]
      c --> ação`,
    'which subgraph a node ends up in': `flowchart TD
      x[declared outside first]
      subgraph s1 [One]
        a --> b
        x
      end
      subgraph s2 [Two]
        b --> c
        subgraph s3 [Three]
          c
          d
        end
        d --> e
      end
      a --> s2`,
    'links to a subgraph declared later': `flowchart LR
      start --> later
      subgraph later [Later]
        n1
      end
      later --> finish`,
    'class before the node exists, style creates it': `flowchart LR
      classDef k fill:#fff
      class early k
      early --> b
      style lonely fill:#eee`,
    'no spaces and odd text': `flowchart LR
      A-->B
      B---C
      C-.->D
      D==>E
      E-->|RCD_#SKU_EXECU_X_#SKU| F["RCD_#SKU_EXECU_X_#SKU_REC_NIQ"]
      F --> G["a&nbsp;b #9829; c"]
      G --> H[Group By 1 + Group By 2: x/y, 'q']`,
  };
  it.each(Object.entries(snippets))('%s', async (_name, source) => {
    await expectSameAsMermaid(source);
  });
});
