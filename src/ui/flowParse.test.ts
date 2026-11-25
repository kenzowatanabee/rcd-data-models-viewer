import { describe, expect, it } from 'vitest';

import type { GraphNode } from '../indexer/types';
import { parseLabel, plainText } from './flowLabel';
import { diagramType, parseFlowchart } from './flowParse';
import {
  SURFACE,
  contrast,
  paintFor,
  parseColour,
  parseStyles,
  styleIssues,
  themeColour,
} from './flowStyle';
import { chooseRenderer } from './flowSupport';
import { docLinker, traceFlow } from './flowTrace';

describe('parseLabel', () => {
  it('splits lines at <br> and keeps italic and bold runs', () => {
    const parsed = parseLabel('One<br/>two <i>three</i><BR>  <b>four</b>  ');
    expect(parsed.ok && parsed.lines).toEqual([
      [{ text: 'One', italic: false, bold: false }],
      [
        { text: 'two ', italic: false, bold: false },
        { text: 'three', italic: true, bold: false },
      ],
      [{ text: 'four', italic: false, bold: true }],
    ]);
  });

  it('decodes entities and Mermaid codes into text, not markup', () => {
    const parsed = parseLabel('#lt;b#gt; &amp; #35; &quot;x&quot;');
    expect(parsed.ok && plainText(parsed.lines)).toBe('<b> & # "x"');
    expect(parsed.ok && parsed.lines[0]?.[0]?.bold).toBe(false);
  });

  it('keeps other tags as inert text and reports them', () => {
    const parsed = parseLabel('<script>alert(1)</script><img src=x onerror=y>');
    expect(parsed.ok && plainText(parsed.lines)).toBe(
      '<script>alert(1)</script><img src=x onerror=y>',
    );
    expect(parsed.ok && parsed.literalTags).toHaveLength(3);
  });

  it('refuses an entity it does not know', () => {
    expect(parseLabel('a &bogus; b')).toEqual({
      ok: false,
      reason: 'unknown entity &bogus;',
    });
  });
});

describe('parseFlowchart', () => {
  const reason = (source: string) => {
    const parsed = parseFlowchart(source);
    return parsed.ok ? null : `${parsed.line}: ${parsed.reason}`;
  };

  it('says what it does not support, and where', () => {
    expect(reason('flowchart TD\n a --> b\n click a callback')).toBe(
      '3: the click statement',
    );
    expect(reason('flowchart TD\n a[open --> b')).toMatch(/^2: /);
    expect(reason('flowchart TD\n a ~~~ b')).toBe('2: an invisible link (~~~)');
    expect(reason('flowchart TD\n a@{ shape: rect }')).toBe(
      '2: the @{ } node syntax',
    );
    expect(reason('flowchart TD\n a(-ellipse-)')).toMatch(
      /unsupported node shape/,
    );
    expect(reason('flowchart TD\n subgraph s\n a')).toBe(
      '3: subgraph s has no end',
    );
    expect(reason('flowchart TD\n a --> b\n end')).toBe(
      '3: “end” without a subgraph',
    );
    expect(reason('flowchart TD\n a --> b %% note')).toMatch(/comment after/);
    expect(reason('flowchart TD\n a --> b\n linkStyle 3 stroke:red')).toBe(
      '3: linkStyle 3: there are only 1 links',
    );
    expect(reason('flowchart TD\n a --oB')).toMatch(/right before a node id/);
    expect(reason('flowchart TD\n a <--x b')).toMatch(/do not match/);
    expect(reason('flowchart-elk TD\n a')).toMatch(/not a flowchart/);
    expect(reason('sequenceDiagram\n a->>b: hi')).toMatch(/not a flowchart/);
    expect(reason('flowchart TD\n my-node --> b')).toMatch(/expected a link/);
  });

  it('reads a small flowchart', () => {
    const parsed = parseFlowchart(`graph LR;
      a[("Data<br/><i>set</i>")] -->|uses| b{{Step}}:::k
      classDef k fill:#fff;`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { chart } = parsed;
    expect(chart.direction).toBe('LR');
    expect(chart.nodes.map((n) => [n.id, n.shape, n.classes])).toEqual([
      ['a', 'cylinder', []],
      ['b', 'hexagon', ['k']],
    ]);
    expect(chart.nodes[1]?.style).toEqual([
      { property: 'fill', value: '#fff' },
    ]);
    expect(chart.edges[0]?.label && plainText(chart.edges[0].label)).toBe(
      'uses',
    );
  });

  it('names the diagram type past comments and directives', () => {
    expect(diagramType('%%{init: {}}%%\n%% c\n\nerDiagram\n a')).toBe(
      'erDiagram',
    );
    expect(diagramType('  flowchart LR')).toBe('flowchart');
  });
});

describe('styles and colours', () => {
  it('parses declarations and colours', () => {
    expect(parseStyles('fill:#e8f0fe,stroke-dasharray:4 3')).toEqual([
      { property: 'fill', value: '#e8f0fe' },
      { property: 'stroke-dasharray', value: '4 3' },
    ]);
    expect(parseStyles('fill')).toBeNull();
    expect(parseColour('#abc')).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
    expect(parseColour('rgb(1, 2, 3)')).toEqual({ r: 1, g: 2, b: 3 });
    expect(parseColour('hsl(1, 2%, 3%)')).toBeNull();
  });

  it('lists what the viewer cannot draw', () => {
    expect(styleIssues(parseStyles('fill:#fff,rx:4') ?? [], 'node')).toEqual([
      'style property rx',
    ]);
    expect(styleIssues(parseStyles('stroke:var(--x)') ?? [], 'edge')).toEqual([
      'colour var(--x)',
    ]);
    expect(
      styleIssues(parseStyles('stroke:#c0392b,stroke-width:2px') ?? [], 'edge'),
    ).toEqual([]);
  });

  it('keeps light colours and turns pale fills dark in the dark theme', () => {
    const pale = parseColour('#e8f0fe');
    if (pale === null) throw new Error('colour');
    expect(themeColour(pale, 'fill', 'light')).toEqual(pale);
    const dark = themeColour(pale, 'fill', 'dark');
    expect(contrast(dark, SURFACE.dark)).toBeLessThan(2);
  });

  // Every colour pair the docs use, in both themes
  const DOC_CLASSES = [
    'fill:#e8f0fe,stroke:#4a6fa5,color:#1a2b45',
    'fill:#fff4e5,stroke:#c77700,color:#5a3600',
    'fill:#fdecea,stroke:#c0392b,color:#5c1a12',
    'fill:#f2f2f2,stroke:#888,color:#333',
    'fill:#e7f6ec,stroke:#2e7d4f,color:#123d24',
  ];
  it.each(DOC_CLASSES)('keeps %s legible in both themes', (text) => {
    for (const theme of ['light', 'dark'] as const) {
      const paint = paintFor(parseStyles(text) ?? [], theme, SURFACE[theme]);
      const fill = parseColour(paint.fill ?? '');
      const stroke = parseColour(paint.stroke ?? '');
      const colour = parseColour(paint.text ?? '');
      if (fill === null || stroke === null || colour === null)
        throw new Error();
      expect(contrast(colour, fill)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(stroke, SURFACE[theme])).toBeGreaterThanOrEqual(3);
    }
  });

  it('fixes a text colour that would be unreadable', () => {
    const paint = paintFor(
      parseStyles('fill:#ffffff,color:#eeeeee') ?? [],
      'light',
      SURFACE.light,
    );
    const text = parseColour(paint.text ?? '');
    expect(text && contrast(text, SURFACE.light)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('chooseRenderer', () => {
  it('draws supported flowcharts itself and hands the rest to Mermaid', () => {
    expect(chooseRenderer('flowchart LR\n a --> b').renderer).toBe('viewer');
    expect(chooseRenderer('erDiagram\n A ||--o{ B : x')).toEqual({
      renderer: 'mermaid',
      reason: 'the viewer draws flowcharts only; this is an erDiagram',
    });
    expect(
      chooseRenderer('flowchart LR\n a --> b\n click a "https://x"'),
    ).toEqual({
      renderer: 'mermaid',
      reason: 'line 3: the viewer does not read the click statement',
    });
    expect(
      chooseRenderer('flowchart LR\n a --> b\n style a fill:#fff,rx:3'),
    ).toEqual({
      renderer: 'mermaid',
      reason: 'the viewer does not draw style property rx',
    });
  });
});

describe('traceFlow', () => {
  it('follows links, through subgraphs, without joining a subgraph’s nodes', () => {
    const parsed = parseFlowchart(`flowchart LR
      subgraph s [S]
        a
        b
      end
      x --> s
      s --> y --> z
      w --> y`);
    if (!parsed.ok) throw new Error(parsed.reason);
    const trace = traceFlow(parsed.chart, 'a');
    expect([...trace.upstream].sort()).toEqual(['x']);
    expect([...trace.downstream].sort()).toEqual(['y', 'z']);
    expect([...trace.downstreamEdges].sort()).toEqual([1, 2]);
    expect(trace.upstream.has('b') || trace.downstream.has('b')).toBe(false);
  });
});

describe('docLinker', () => {
  const node = (
    id: string,
    name: string,
    aliases: string[] = [],
  ): GraphNode => ({
    id,
    kind: 'dataset',
    name,
    aliases,
    file: id,
    title: null,
    layer: null,
    platform: null,
    status: null,
    domoId: null,
    lastUpdated: null,
  });
  const link = docLinker([
    node('docs/datasets/a.md', 'RCD_ATACADÃO', ['RCD ATACADAO OLD']),
    node('docs/datasets/b.md', 'SHARED'),
    node('docs/pipelines/b.md', 'shared'),
  ]);
  const label = (text: string) => parseLabel(text);
  it('links by name or alias on the first line, ignoring case and accents', () => {
    const one = label('rcd atacadao<br/><i>daily</i>');
    expect(one.ok && link(one.lines)?.id).toBe('docs/datasets/a.md');
    const alias = label('RCD_ATACADAO_OLD');
    expect(alias.ok && link(alias.lines)?.id).toBe('docs/datasets/a.md');
  });
  it('never links an ambiguous name, or a later line', () => {
    const shared = label('Shared');
    expect(shared.ok && link(shared.lines)).toBeNull();
    const second = label('Step<br/>RCD_ATACADÃO');
    expect(second.ok && link(second.lines)).toBeNull();
  });
});
