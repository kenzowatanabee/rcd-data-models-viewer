import type { KeyboardEvent, PointerEvent } from 'react';

interface Props {
  /** Which edge of its column the handle sits on. */
  edge: 'left' | 'right';
  width: number;
  min: number;
  max: number;
  /** Clamps a proposed width; the layout decides what fits. */
  clamp: (width: number) => number;
  onWidth: (width: number) => void;
  /** Double-click goes back to the default width. */
  onReset: () => void;
  label: string;
  controls: string;
}

/** A column edge to drag (or focus and use the arrow keys) to resize it. */
export function ResizeHandle({
  edge,
  width,
  min,
  max,
  clamp,
  onWidth,
  onReset,
  label,
  controls,
}: Props) {
  // Dragging the left edge to the left makes the column wider
  const sign = edge === 'right' ? 1 : -1;

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    handle.classList.add('is-dragging');
    document.body.classList.add('is-resizing');
    const startX = event.clientX;
    const startWidth = width;
    const move = (e: globalThis.PointerEvent) =>
      onWidth(clamp(startWidth + sign * (e.clientX - startX)));
    const end = () => {
      handle.classList.remove('is-dragging');
      document.body.classList.remove('is-resizing');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const step = event.shiftKey ? 48 : 16;
    const delta =
      event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    if (delta === 0) return;
    event.preventDefault();
    onWidth(clamp(width + sign * delta));
  };

  return (
    <div
      className={`resizer resizer-${edge}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-controls={controls}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Drag to resize; arrow keys work too; double-click resets"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={onReset}
    />
  );
}
