import { Panel, useReactFlow, useViewportStore } from '@xyflow/react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { useEffect, type RefObject } from 'react';

import { isOverview, zoomPercent } from './graphChrome';
import { motionDuration } from './settings';

interface Props {
  /** The canvas element; it carries the zoom for the CSS. */
  canvasRef: RefObject<HTMLDivElement | null>;
  reducedMotion: boolean;
  onFit: () => void;
}

/**
 * Zoom out, the zoom level, zoom in, fit and 100%, at the bottom left
 * where fitting keeps room for them.
 */
export function CanvasControls({ canvasRef, reducedMotion, onFit }: Props) {
  const zoom = useViewportStore((state) => state.transform[2]);
  const { zoomIn, zoomOut, zoomTo } = useReactFlow();
  const duration = motionDuration(200, reducedMotion);

  // Set straight on the element so zooming re-renders no nodes: the CSS
  // switches to blocks below the threshold and sizes band titles by it
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    canvas.style.setProperty('--zoom', String(zoom));
    canvas.dataset.zoom = isOverview(zoom) ? 'overview' : 'detail';
  }, [canvasRef, zoom]);

  return (
    <Panel position="bottom-left" className="graph-zoom">
      <div className="graph-zoom-group" role="group" aria-label="Zoom">
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => void zoomOut({ duration })}
        >
          <Minus size={14} aria-hidden="true" />
        </button>
        <span className="graph-zoom-level" aria-live="off" title="Zoom level">
          {zoomPercent(zoom)}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => void zoomIn({ duration })}
        >
          <Plus size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="graph-zoom-group">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          title="Fit everything shown to the window"
          onClick={onFit}
        >
          <Maximize size={14} aria-hidden="true" />
          Fit
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          title="Zoom to actual size"
          onClick={() => void zoomTo(1, { duration })}
        >
          100%
        </button>
      </div>
    </Panel>
  );
}
