import { Expand, Info, Maximize2, Minimize2 } from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  FlowView,
  flowModel,
  hasFlowModel,
  useFlowFontsReady,
  type FlowModel,
} from './FlowDiagram';
import type { FlowChart } from './flowParse';
import { chooseRenderer } from './flowSupport';
import { renderMermaid, type DiagramResult } from './mermaid';
import { Lightbox } from './Lightbox';
import { startsFitted, type Size } from './panZoom';
import { useTheme } from './theme';

/** The diagram's natural size, from the width/viewBox mermaid gave it. */
function svgSize(svg: SVGSVGElement | null): Size | null {
  if (svg === null) return null;
  const box = svg.viewBox.baseVal as SVGRect | null;
  if (box !== null && box.width > 0 && box.height > 0) {
    return { width: box.width, height: box.height };
  }
  const rect = svg.getBoundingClientRect();
  return rect.width > 0 ? { width: rect.width, height: rect.height } : null;
}

/** Mermaid's own rendering, as before the viewer had a renderer. */
function MermaidView({
  source,
  toolbarStart,
  note,
}: {
  source: string;
  toolbarStart: ReactNode;
  note: string | null;
}) {
  const { theme } = useTheme();
  const [result, setResult] = useState<DiagramResult | null>(null);
  // The reader's choice wins over the size-based default
  const [choice, setChoice] = useState<boolean | null>(null);
  const [auto, setAuto] = useState(false);
  const fit = choice ?? auto;
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const diagramRef = useRef<HTMLDivElement>(null);
  // On a theme change the old diagram stays up until the new one is drawn
  useEffect(() => {
    let cancelled = false;
    void renderMermaid(source, theme).then((rendered) => {
      if (!cancelled) setResult(rendered);
    });
    return () => {
      cancelled = true;
    };
  }, [source, theme]);

  useLayoutEffect(() => {
    const box = diagramRef.current;
    const svg = box?.querySelector('svg');
    if (!box || !svg) return;
    const padding = parseFloat(getComputedStyle(box).paddingLeft) * 2 || 0;
    const natural = Number(svg.getAttribute('width'));
    setAuto(startsFitted(natural, box.clientWidth - padding));
  }, [result]);

  if (result === null) {
    return (
      <div className="mermaid-pending" role="status">
        <span className="spinner" aria-hidden="true" />
        Rendering diagram…
      </div>
    );
  }
  if ('error' in result) {
    return (
      <div className="mermaid-error">
        <p>
          <strong>This diagram could not be rendered.</strong>
        </p>
        {/* Parser errors point at a column, so keep their line breaks */}
        <pre className="mermaid-message">{result.error}</pre>
        {note !== null && <p className="mermaid-note">Viewer: {note}.</p>}
        <p>Source:</p>
        <pre>
          <code>{source}</code>
        </pre>
      </div>
    );
  }
  const close = () => {
    setOpen(false);
    openerRef.current?.focus();
  };
  return (
    <figure className="mermaid">
      <div className="mermaid-toolbar">
        {toolbarStart}
        <div className="diagram-tools">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setChoice(!fit)}
            aria-pressed={fit}
            title={fit ? 'Show at actual size' : 'Shrink to the column width'}
          >
            {fit ? (
              <Maximize2 size={13} aria-hidden="true" />
            ) : (
              <Minimize2 size={13} aria-hidden="true" />
            )}
            {fit ? 'Actual size' : 'Fit to width'}
          </button>
          <button
            ref={openerRef}
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setOpen(true)}
            title="Open larger, with pan and zoom"
          >
            <Expand size={13} aria-hidden="true" />
            Open larger
          </button>
        </div>
      </div>
      <div
        ref={diagramRef}
        className={fit ? 'mermaid-diagram fit' : 'mermaid-diagram'}
        // mermaid's output, sanitised by mermaid itself in strict mode
        dangerouslySetInnerHTML={{ __html: result.svg }}
      />
      {open && (
        <Lightbox
          label="Diagram"
          size={(content) => svgSize(content.querySelector('svg'))}
          onClose={close}
        >
          <div
            // mermaid's output, sanitised by mermaid itself in strict mode
            dangerouslySetInnerHTML={{ __html: result.svg }}
          />
        </Lightbox>
      )}
    </figure>
  );
}

type Renderer = 'viewer' | 'mermaid';

/** Viewer | Mermaid, for a diagram both can draw; not remembered. */
function RendererSwitch({
  value,
  onChange,
}: {
  value: Renderer;
  onChange: (renderer: Renderer) => void;
}) {
  return (
    <div
      className="segmented renderer-switch"
      role="group"
      aria-label="Drawn by"
    >
      {(['viewer', 'mermaid'] as const).map((renderer) => (
        <button
          key={renderer}
          type="button"
          aria-pressed={value === renderer}
          onClick={() => onChange(renderer)}
          title={
            renderer === 'viewer'
              ? 'Drawn by the viewer: click a node to trace it'
              : 'Drawn by the Mermaid library, as on GitHub'
          }
        >
          {renderer === 'viewer' ? 'Viewer' : 'Mermaid'}
        </button>
      ))}
    </div>
  );
}

/** Which renderer drew a diagram the viewer does not draw, and why. */
function RendererNote({ reason }: { reason: string }) {
  const text = `Drawn by Mermaid: ${reason}`;
  return (
    <span className="renderer-note" tabIndex={0} title={text}>
      <Info size={13} aria-hidden="true" />
      Mermaid
      <span className="visually-hidden">: {reason}</span>
    </span>
  );
}

/** Height kept for a diagram not laid out yet, from its size in lines. */
const pendingHeight = (source: string) =>
  Math.min(900, Math.max(180, source.split('\n').length * 14));

/**
 * The viewer's drawing, laid out only once the diagram comes near the
 * viewport (or its <details> opens), and only after the font is ready.
 */
function LazyFlow({
  source,
  chart,
  toolbarStart,
}: {
  source: string;
  chart: FlowChart;
  toolbarStart: ReactNode;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(() => hasFlowModel(source));
  const fontsReady = useFlowFontsReady();
  useEffect(() => {
    if (near) return;
    const holder = holderRef.current;
    if (holder === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: '800px 0px' },
    );
    observer.observe(holder);
    return () => observer.disconnect();
  }, [near]);
  const result = useMemo(():
    { model: FlowModel } | { error: string } | null => {
    if (!near || !fontsReady) return null;
    try {
      return { model: flowModel(source, chart) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [near, fontsReady, source, chart]);

  if (result === null) {
    return (
      <div
        ref={holderRef}
        className="mermaid-pending flow-pending"
        role="status"
        style={{ minHeight: pendingHeight(source) }}
      >
        <span className="spinner" aria-hidden="true" />
        Drawing diagram…
      </div>
    );
  }
  if ('error' in result) {
    return (
      <MermaidView
        source={source}
        toolbarStart={
          <RendererNote reason={`the layout failed (${result.error})`} />
        }
        note={null}
      />
    );
  }
  return (
    <FlowView
      source={source}
      model={result.model}
      toolbarStart={toolbarStart}
    />
  );
}

/**
 * A ```mermaid block. Flowcharts the viewer can draw in full are drawn by
 * its own renderer, with a switch to compare with Mermaid; anything else
 * is drawn by Mermaid, with a note saying why.
 */
export function DiagramBlock({ source }: { source: string }) {
  const choice = useMemo(() => chooseRenderer(source), [source]);
  const [want, setWant] = useState<Renderer>('viewer');
  if (choice.renderer === 'viewer') {
    const toolbarStart = <RendererSwitch value={want} onChange={setWant} />;
    return (
      <div className="diagram-block" data-renderer={want}>
        {want === 'viewer' ? (
          <LazyFlow
            source={source}
            chart={choice.chart}
            toolbarStart={toolbarStart}
          />
        ) : (
          <MermaidView
            source={source}
            toolbarStart={toolbarStart}
            note={null}
          />
        )}
      </div>
    );
  }
  return (
    <div className="diagram-block" data-renderer="mermaid">
      <MermaidView
        source={source}
        toolbarStart={<RendererNote reason={choice.reason} />}
        note={choice.reason}
      />
    </div>
  );
}
