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

/** Reads a colour token from the stylesheet; mermaid needs literal values. */
function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;
}

/**
 * Mermaid's `base` theme coloured from the app's tokens, so diagrams match
 * the page in both themes. Docs that set their own `classDef` colours keep
 * them.
 */
export function themeVariables(theme: Theme): Record<string, string | boolean> {
  const dark = theme === 'dark';
  const surface = token('--color-surface', dark ? '#202329' : '#ffffff');
  const raised = token('--color-surface-raised', dark ? '#262a31' : '#ffffff');
  const sunken = token('--color-surface-sunken', dark ? '#121417' : '#f0f2f5');
  const chrome = token('--color-bg-chrome', dark ? '#1d2025' : '#f6f7f9');
  const text = token('--color-text', dark ? '#e6e8eb' : '#1b1f24');
  const secondary = token(
    '--color-text-secondary',
    dark ? '#c0c5cc' : '#424a53',
  );
  const border = token('--color-border-strong', dark ? '#6c737d' : '#7f8790');
  const subtleBorder = token('--color-border', dark ? '#30343b' : '#e1e4e8');
  const accentSubtle = token(
    '--color-accent-subtle',
    dark ? '#22324f' : '#e3ebfb',
  );
  const edge = token('--color-edge', dark ? '#6c737d' : '#7f8790');
  return {
    darkMode: dark,
    fontSize: '14px',
    background: surface,
    primaryColor: dark ? raised : chrome,
    primaryBorderColor: border,
    primaryTextColor: text,
    secondaryColor: accentSubtle,
    secondaryBorderColor: border,
    secondaryTextColor: text,
    tertiaryColor: sunken,
    tertiaryBorderColor: subtleBorder,
    tertiaryTextColor: text,
    mainBkg: dark ? raised : chrome,
    nodeBorder: border,
    nodeTextColor: text,
    textColor: secondary,
    lineColor: edge,
    clusterBkg: dark ? chrome : sunken,
    clusterBorder: subtleBorder,
    titleColor: text,
    edgeLabelBackground: surface,
    noteBkgColor: token('--color-warning-subtle', '#fdf5d8'),
    noteTextColor: text,
    noteBorderColor: token('--color-warning', '#7d5300'),
    attributeBackgroundColorOdd: surface,
    attributeBackgroundColorEven: dark ? raised : chrome,
  };
}

/** Mermaid bakes the theme into each SVG, so a theme change re-renders. */
function configure(mermaid: Mermaid, theme: Theme): void {
  if (configured === theme) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    themeVariables: themeVariables(theme),
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
