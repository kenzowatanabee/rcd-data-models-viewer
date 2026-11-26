import {
  ArrowLeft,
  ArrowRight,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { ShortcutKeys, useAriaKeys, useKeyHint } from './ShortcutLayer';

interface Props {
  sidebar: {
    /** Docked and hidden, or (as a drawer) closed. */
    collapsed: boolean;
    /** Shown as an overlay drawer on narrow windows. */
    drawer: boolean;
    onToggle: () => void;
  };
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onPalette: () => void;
  /** The tab strip. */
  children: ReactNode;
}

/** The slim bar above the content: sidebar, history, tabs, quick open. */
export function TopBar({
  sidebar,
  canBack,
  canForward,
  onBack,
  onForward,
  onPalette,
  children,
}: Props) {
  const sidebarHint = useKeyHint('toggle-sidebar');
  const backHint = useKeyHint('back');
  const forwardHint = useKeyHint('forward');
  const paletteHint = useKeyHint('palette');
  const paletteKeys = useAriaKeys('palette');
  const sidebarLabel = sidebar.drawer
    ? 'Show the docs list'
    : sidebar.collapsed
      ? 'Show the sidebar'
      : 'Hide the sidebar';
  return (
    // The bar is where a frameless window would be dragged; its controls
    // opt out (see .drag-region in layout.css)
    <header className="topbar drag-region">
      <div className="topbar-nav">
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          aria-label={sidebarLabel}
          aria-controls={sidebar.drawer ? undefined : 'sidebar'}
          aria-expanded={!sidebar.collapsed}
          title={`${sidebarLabel}${sidebarHint}`}
          onClick={sidebar.onToggle}
        >
          {sidebar.drawer ? (
            <Menu size={16} aria-hidden="true" />
          ) : sidebar.collapsed ? (
            <PanelLeftOpen size={16} aria-hidden="true" />
          ) : (
            <PanelLeftClose size={16} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          aria-label="Back"
          title={`Back${backHint}`}
          disabled={!canBack}
          onClick={onBack}
        >
          <ArrowLeft size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          aria-label="Forward"
          title={`Forward${forwardHint}`}
          disabled={!canForward}
          onClick={onForward}
        >
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      </div>
      {children}
      <button
        type="button"
        className="palette-trigger"
        onClick={onPalette}
        aria-keyshortcuts={paletteKeys}
        title={`Quick open${paletteHint}`}
      >
        <Search size={14} aria-hidden="true" />
        <span className="palette-trigger-label">Go to…</span>
        <ShortcutKeys id="palette" />
      </button>
    </header>
  );
}
