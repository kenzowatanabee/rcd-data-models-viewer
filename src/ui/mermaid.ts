import type { Mermaid } from 'mermaid';

import { naturalSize } from './svgSize';

export type DiagramResult = { svg: string } | { error: string };

let loading: Promise<Mermaid> | null = null;

// Loaded on first use: mermaid is large and most pages have no diagram
function loadMermaid(): Promise<Mermaid> {
  loading ??= import('mermaid').then(({ default: mermaid }) => {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'default',
      // Errors are shown next to the source instead of as a bomb icon
      suppressErrorRendering: true,
    });
    return mermaid;
  });
  return loading;
}

let queue: Promise<unknown> = Promise.resolve();
let counter = 0;

/** Renders one diagram; renders run one at a time, as mermaid expects. */
export function renderMermaid(source: string): Promise<DiagramResult> {
  const run = async (): Promise<DiagramResult> => {
    const mermaid = await loadMermaid();
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
