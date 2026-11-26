import {
  FileText,
  Folder,
  HeartPulse,
  Menu,
  Search,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Rows3,
  Rows4,
  Sun,
  Waypoints,
} from 'lucide-react';

import { desktop } from './desktop';
import { folderName, type Density, type ThemePreference } from './settings';
import { IS_MAC, Keys } from './ShortcutLayer';
import { useTheme } from './theme';

export type Section = 'docs' | 'graph' | 'health';

interface Props {
  section: Section;
  /** Where "Docs" leads: the last doc open, so switching back is cheap. */
  docsHref: string;
  graphHref: string;
  healthHref: string;
  /** To-do items on the health page; null until the index loads. */
  issues: number | null;
  onPalette: () => void;
  docsPath: string | null;
  /** Null where the section has no sidebar. */
  sidebar: {
    /** Docked and hidden, or (as a drawer) closed. */
    collapsed: boolean;
    /** Shown as an overlay drawer on narrow windows. */
    drawer: boolean;
    onToggle: () => void;
  } | null;
  density: Density;
  onDensity: (density: Density) => void;
}

const DENSITIES: { value: Density; label: string; icon: typeof Sun }[] = [
  { value: 'comfortable', label: 'Comfortable rows', icon: Rows3 },
  { value: 'compact', label: 'Compact rows', icon: Rows4 },
];

const THEMES: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light theme', icon: Sun },
  { value: 'dark', label: 'Dark theme', icon: Moon },
  { value: 'system', label: 'Follow the system theme', icon: Monitor },
];

export function TopBar({
  section,
  docsHref,
  graphHref,
  healthHref,
  issues,
  onPalette,
  docsPath,
  sidebar,
  density,
  onDensity,
}: Props) {
  const { preference, setPreference } = useTheme();
  const sections = [
    { id: 'docs', label: 'Docs', href: docsHref, icon: FileText },
    { id: 'graph', label: 'Lineage graph', href: graphHref, icon: Waypoints },
    { id: 'health', label: 'Docs health', href: healthHref, icon: HeartPulse },
  ] as const;
  const shortcut = IS_MAC ? '⌘K' : 'Ctrl+K';
  return (
    // The bar is where a frameless window would be dragged; its controls
    // opt out (see .drag-region in layout.css)
    <header className="topbar drag-region">
      {sidebar !== null && (
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label={
            sidebar.drawer
              ? 'Show the docs list'
              : sidebar.collapsed
                ? 'Show the sidebar'
                : 'Hide the sidebar'
          }
          aria-controls={sidebar.drawer ? undefined : 'sidebar'}
          aria-expanded={!sidebar.collapsed}
          aria-keyshortcuts="["
          title={
            sidebar.drawer
              ? 'Show the docs list ([)'
              : sidebar.collapsed
                ? 'Show the sidebar ([)'
                : 'Hide the sidebar ([)'
          }
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
      )}
      <a className="brand" href="#/">
        RCD data models
      </a>
      <span className="topbar-divider" aria-hidden="true" />
      <nav className="topnav" aria-label="Sections">
        <ul>
          {sections.map(({ id, label, href, icon: Icon }) => (
            <li key={id}>
              <a
                href={href}
                title={label}
                aria-current={section === id ? 'page' : undefined}
              >
                <Icon size={15} aria-hidden="true" />
                <span className="topnav-label">{label}</span>
                {id === 'health' && issues !== null && issues > 0 && (
                  <span
                    className="nav-badge tabular"
                    title={`${issues} things to fix`}
                  >
                    <span className="visually-hidden">, </span>
                    {issues}
                    <span className="visually-hidden"> to fix</span>
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <span className="topbar-spacer" />
      <button
        type="button"
        className="palette-trigger"
        onClick={onPalette}
        aria-keyshortcuts={IS_MAC ? 'Meta+K' : 'Control+K'}
        title={`Quick open (${shortcut})`}
      >
        <Search size={14} aria-hidden="true" />
        <span className="palette-trigger-label">Go to…</span>
        <Keys chord="mod+k" />
      </button>
      {docsPath !== null &&
        (desktop === null ? (
          <span className="docs-folder" title={`Docs folder: ${docsPath}`}>
            <Folder size={14} aria-hidden="true" />
            <span>{folderName(docsPath)}</span>
          </span>
        ) : (
          <button
            type="button"
            className="docs-folder"
            title={`Docs folder: ${docsPath}`}
            aria-label={`Docs folder: ${folderName(docsPath)}`}
            aria-haspopup="menu"
            onClick={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              void desktop?.showFolderMenu({
                x: Math.max(0, box.left),
                y: Math.max(0, box.bottom),
              });
            }}
          >
            <Folder size={14} aria-hidden="true" />
            <span>{folderName(docsPath)}</span>
          </button>
        ))}
      <span className="topbar-divider" aria-hidden="true" />
      <div
        className="segmented segmented-icons"
        role="group"
        aria-label="Row density"
      >
        {DENSITIES.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={density === value}
            aria-label={label}
            title={label}
            onClick={() => onDensity(value)}
          >
            <Icon size={14} aria-hidden="true" />
          </button>
        ))}
      </div>
      <div
        className="segmented segmented-icons"
        role="group"
        aria-label="Theme"
      >
        {THEMES.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={preference === value}
            aria-label={label}
            title={label}
            onClick={() => setPreference(value)}
          >
            <Icon size={14} aria-hidden="true" />
          </button>
        ))}
      </div>
    </header>
  );
}
