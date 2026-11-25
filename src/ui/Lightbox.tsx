import { Minus, Plus, Scan, X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type WheelEvent,
} from 'react';

import { ModalDialog } from './Dialog';
import {
  centred,
  fitView,
  wheelFactor,
  zoomAt,
  type Size,
  type View,
} from './panZoom';

export interface LightboxApi {
  /** Centres the view on a box in content coordinates, zooming in if small. */
  centreOn: (rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
}

interface LightboxProps {
  label: string;
  /** The content's size at 100%, read once it is in the page. */
  size: (content: HTMLElement) => Size | null;
  onClose: () => void;
  /** Extra controls for the toolbar, such as a find box. */
  tools?: (api: LightboxApi) => ReactNode;
  /** The content; a click that ends a drag does not reach it. */
  children: ReactNode;
}

/** A full-window view with pan and zoom, for any diagram. */
export function Lightbox({
  label,
  size,
  onClose,
  tools,
  children,
}: LightboxProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{
    x: number;
    y: number;
    id: number;
    moved: boolean;
  } | null>(null);
  const moved = useRef(false);

  const sizes = useCallback(() => {
    const viewport = viewportRef.current?.getBoundingClientRect();
    const content = contentRef.current ? size(contentRef.current) : null;
    if (viewport === undefined || content === null) return null;
    return {
      viewport: { width: viewport.width, height: viewport.height },
      content,
    };
  }, [size]);

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

  // Centring needs the viewport's size, so it happens in an effect
  const [target, setTarget] = useState<{
    rect: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const api = useMemo<LightboxApi>(
    () => ({ centreOn: (rect) => setTarget({ rect }) }),
    [],
  );
  useEffect(() => {
    if (target === null) return;
    const viewport = viewportRef.current?.getBoundingClientRect();
    if (!viewport) return;
    const { rect } = target;
    setView((current) => {
      const scale = Math.max(current.scale, 1);
      return {
        scale,
        x: viewport.width / 2 - (rect.x + rect.width / 2) * scale,
        y: viewport.height / 2 - (rect.y + rect.height / 2) * scale,
      };
    });
  }, [target]);

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const at = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    setView((current) => zoomAt(current, wheelFactor(event.deltaY), at));
  };

  // Panning starts after a few pixels, so a click still reaches the diagram
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      id: event.pointerId,
      moved: false,
    };
    moved.current = false;
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (start === null || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 4) return;
    if (!start.moved) {
      event.currentTarget.setPointerCapture(event.pointerId);
      moved.current = true;
    }
    drag.current = {
      ...start,
      x: event.clientX,
      y: event.clientY,
      moved: true,
    };
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
    <ModalDialog
      className="lightbox"
      label={label}
      onClose={onClose}
      closeOnBackdrop
      onOpen={fit}
      // Start on the diagram, so the arrow and zoom keys work at once
      initialFocus={viewportRef}
    >
      <div className="lightbox-toolbar">
        <div className="lightbox-tools">
          <span className="lightbox-zoom tabular" aria-live="polite">
            {Math.round(view.scale * 100)}%
          </span>
          {tools?.(api)}
        </div>
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
        onClickCapture={(event) => {
          // The click at the end of a drag is not a click on the diagram
          if (moved.current) {
            event.stopPropagation();
            moved.current = false;
          }
        }}
      >
        <div
          ref={contentRef}
          className="lightbox-content"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}
        >
          {children}
        </div>
      </div>
    </ModalDialog>
  );
}
