import {
  Expand,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Scan,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from 'react';

import { renderMermaid, type DiagramResult } from './mermaid';
import {
  centred,
  fitView,
  startsFitted,
  wheelFactor,
  zoomAt,
  type Size,
  type View,
} from './panZoom';
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

function Lightbox({ svg, onClose }: { svg: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);

  const sizes = useCallback(() => {
    const viewport = viewportRef.current?.getBoundingClientRect();
    const content = svgSize(contentRef.current?.querySelector('svg') ?? null);
    if (viewport === undefined || content === null) return null;
    return {
      viewport: { width: viewport.width, height: viewport.height },
      content,
    };
  }, []);

  const fit = useCallback(() => {
    const measured = sizes();
    if (measured) setView(fitView(measured.content, measured.viewport));
  }, [sizes]);

  const actual = () => {
    const measured = sizes();
    if (measured) setView(centred(measured.content, measured.viewport, 1));
  };

  const zoomBy = (factor: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    setView((current) =>
      zoomAt(current, factor, { x: rect.width / 2, y: rect.height / 2 }),
    );
  };

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    // A modal dialog keeps focus inside it and makes the page inert
    if (!dialog.open) dialog.showModal();
    // Start on the diagram, so the arrow and zoom keys work at once
    viewportRef.current?.focus();
    fit();
    return () => dialog.close();
  }, [fit]);

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const at = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    setView((current) => zoomAt(current, wheelFactor(event.deltaY), at));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (start === null || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    drag.current = { ...start, x: event.clientX, y: event.clientY };
    setView((current) => ({
      ...current,
      x: current.x + dx,
      y: current.y + dy,
    }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = 48;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setView((current) => ({
        ...current,
        x: current.x + move[0],
        y: current.y + move[1],
      }));
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomBy(1.25);
    } else if (event.key === '-') {
      event.preventDefault();
      zoomBy(0.8);
    } else if (event.key === '0') {
      event.preventDefault();
      fit();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="lightbox"
      aria-label="Diagram"
      // Esc fires `cancel`; let React own the closing
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        // Keep Tab inside the dialog instead of escaping to the browser
        const focusable = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'button, [tabindex="0"]',
          ),
        ];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="lightbox-toolbar">
        <span className="lightbox-zoom tabular" aria-live="polite">
          {Math.round(view.scale * 100)}%
        </span>
        <div className="lightbox-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-icon"
            onClick={() => zoomBy(0.8)}
            aria-label="Zoom out"
            title="Zoom out (−)"
          >
            <Minus size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-icon"
            onClick={() => zoomBy(1.25)}
            aria-label="Zoom in"
            title="Zoom in (+)"
          >
            <Plus size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={fit}
            title="Fit to window (0)"
          >
            <Scan size={13} aria-hidden="true" />
            Fit
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={actual}
            title="Actual size"
          >
            100%
          </button>
          <span className="toolbar-divider" aria-hidden="true" />
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-icon"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div
        ref={viewportRef}
        className="lightbox-viewport"
        tabIndex={0}
        role="application"
        aria-roledescription="diagram viewer"
        aria-label="Drag or use the arrow keys to pan, scroll or + and − to zoom, 0 to fit"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <div
          ref={contentRef}
          className="lightbox-content"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}
          // mermaid's output, sanitised by mermaid itself in strict mode
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </dialog>
  );
}

export function MermaidBlock({ source }: { source: string }) {
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
      <div
        ref={diagramRef}
        className={fit ? 'mermaid-diagram fit' : 'mermaid-diagram'}
        // mermaid's output, sanitised by mermaid itself in strict mode
        dangerouslySetInnerHTML={{ __html: result.svg }}
      />
      {open && <Lightbox svg={result.svg} onClose={close} />}
    </figure>
  );
}
