import type { Mermaid } from 'mermaid';

import type { Theme } from './settings';
import { naturalSize } from './svgSize';

export type DiagramResult = { svg: string } | { error: string };

let loading: Promise<Mermaid> | null = null;
let configured: Theme | null = null;

// Loaded on first use: mermaid is large and most pages have no diagram
function loadMermaid(): Promise<Mermaid> {
  loading ??= import('mermaid').then(({ default: mermaid }) => mermaid);
  return loading;
}

/** Mermaid bakes the theme into each SVG, so a theme change re-renders. */
function configure(mermaid: Mermaid, theme: Theme): void {
  if (configured === theme) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: theme === 'dark' ? 'dark' : 'neutral',
    fontFamily: "'Inter Variable', 'Segoe UI', system-ui, sans-serif",
    // Errors are shown next to the source instead of as a bomb icon
    suppressErrorRendering: true,
  });
  configured = theme;
}

let queue: Promise<unknown> = Promise.resolve();
let counter = 0;

/** Renders one diagram; renders run one at a time, as mermaid expects. */
export function renderMermaid(
  source: string,
  theme: Theme,
): Promise<DiagramResult> {
  const run = async (): Promise<DiagramResult> => {
    const mermaid = await loadMermaid();
    configure(mermaid, theme);
    counter += 1;
    const id = `mermaid-diagram-${counter}`;
    try {
      const { svg } = await mermaid.render(id, source);
      return { svg: naturalSize(svg) };
    } catch (error) {
      // mermaid can leave its scratch element behind on failure
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
      return { error: error instanceof Error ? error.message : String(error) };
    }
  };
  const result = queue.then(run, run);
  queue = result;
  return result;
}
