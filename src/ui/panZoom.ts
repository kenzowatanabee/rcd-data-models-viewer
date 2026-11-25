/** Where the content sits in the viewport: translate, then scale. */
export interface View {
  x: number;
  y: number;
  scale: number;
}

export interface Size {
  width: number;
  height: number;
}

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 4;

export const clampScale = (scale: number) =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/**
 * Scales the content to fit inside the viewport with `padding` around it,
 * never above 100% (small diagrams stay crisp), and centres it.
 */
export function fitView(content: Size, viewport: Size, padding = 24): View {
  if (content.width <= 0 || content.height <= 0) {
    return { x: 0, y: 0, scale: 1 };
  }
  const scale = clampScale(
    Math.min(
      1,
      (viewport.width - 2 * padding) / content.width,
      (viewport.height - 2 * padding) / content.height,
    ),
  );
  return centred(content, viewport, scale);
}

/** The content at `scale`, centred in the viewport. */
export function centred(content: Size, viewport: Size, scale: number): View {
  return {
    x: (viewport.width - content.width * scale) / 2,
    y: (viewport.height - content.height * scale) / 2,
    scale,
  };
}

/**
 * Zooms by `factor` keeping the content point under `at` (viewport
 * coordinates) where it is, as wheel and pinch zoom do.
 */
export function zoomAt(
  view: View,
  factor: number,
  at: { x: number; y: number },
): View {
  const scale = clampScale(view.scale * factor);
  const ratio = scale / view.scale;
  return {
    x: at.x - (at.x - view.x) * ratio,
    y: at.y - (at.y - view.y) * ratio,
    scale,
  };
}

/** Wheel delta to a zoom factor: smooth for trackpads, ~10% per notch. */
export const wheelFactor = (deltaY: number) =>
  Math.exp(-Math.max(-100, Math.min(100, deltaY)) * 0.001);

/**
 * Whether a diagram starts fitted to the column: only when it is a little
 * wider than the column, so shrinking it keeps the text readable. Much
 * wider diagrams start at their natural size and scroll.
 */
export const startsFitted = (natural: number, available: number) =>
  available > 0 && natural > available && available / natural >= 0.6;
