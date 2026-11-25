import {
  FileText,
  Folder,
  HeartPulse,
  Search,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Waypoints,
} from 'lucide-react';

import { folderName, type ThemePreference } from './settings';
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
  sidebar: { collapsed: boolean; onToggle: () => void } | null;
}

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
}: Props) {
  const { preference, setPreference } = useTheme();
  const sections = [
    { id: 'docs', label: 'Docs', href: docsHref, icon: FileText },
    { id: 'graph', label: 'Lineage graph', href: graphHref, icon: Waypoints },
    { id: 'health', label: 'Docs health', href: healthHref, icon: HeartPulse },
  ] as const;
  const shortcut = IS_MAC ? '⌘K' : 'Ctrl+K';
  return (
    <header className="topbar">
      {sidebar !== null && (
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label={
            sidebar.collapsed ? 'Show the sidebar' : 'Hide the sidebar'
          }
          aria-controls="sidebar"
          aria-expanded={!sidebar.collapsed}
          title={sidebar.collapsed ? 'Show the sidebar' : 'Hide the sidebar'}
          onClick={sidebar.onToggle}
        >
          {sidebar.collapsed ? (
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
              <a href={href} aria-current={section === id ? 'page' : undefined}>
                <Icon size={15} aria-hidden="true" />
                {label}
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
      {docsPath !== null && (
        <span className="docs-folder" title={`Docs folder: ${docsPath}`}>
          <Folder size={14} aria-hidden="true" />
          <span>{folderName(docsPath)}</span>
        </span>
      )}
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
