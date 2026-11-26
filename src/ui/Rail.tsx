import {
  FileText,
  HeartPulse,
  Keyboard,
  Search,
  Settings,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { useKeyHint } from './ShortcutLayer';
import type { ShortcutId } from './shortcuts';

export type RailSection = 'docs' | 'graph' | 'health';

interface Props {
  section: RailSection;
  issues: number | null;
  onSection: (section: RailSection) => void;
  onPalette: () => void;
  onSettings: () => void;
  onHelp: () => void;
  /** The folder control, when the sidebar that holds it is hidden. */
  folder: ReactNode;
}

function RailButton({
  icon: Icon,
  label,
  shortcut,
  current,
  onClick,
  badge,
}: {
  icon: LucideIcon;
  label: string;
  shortcut: ShortcutId;
  current?: boolean;
  onClick: () => void;
  badge?: ReactNode;
}) {
  const hint = useKeyHint(shortcut);
  return (
    <button
      type="button"
      className="rail-button"
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      title={`${label}${hint}`}
      onClick={onClick}
    >
      <Icon size={18} aria-hidden="true" />
      {badge}
    </button>
  );
}

/** The far-left column: the sections, then quick open, Settings and help. */
export function Rail({
  section,
  issues,
  onSection,
  onPalette,
  onSettings,
  onHelp,
  folder,
}: Props) {
  return (
    <nav className="rail" aria-label="Sections">
      <RailButton
        icon={FileText}
        label="Docs"
        shortcut="go-docs"
        current={section === 'docs'}
        onClick={() => onSection('docs')}
      />
      <RailButton
        icon={Waypoints}
        label="Lineage graph"
        shortcut="go-graph"
        current={section === 'graph'}
        onClick={() => onSection('graph')}
      />
      <RailButton
        icon={HeartPulse}
        label={
          issues !== null && issues > 0
            ? `Docs health, ${issues} to fix`
            : 'Docs health'
        }
        shortcut="go-health"
        current={section === 'health'}
        onClick={() => onSection('health')}
        badge={
          issues !== null && issues > 0 ? (
            <span className="rail-badge tabular" aria-hidden="true">
              {issues > 99 ? '99+' : issues}
            </span>
          ) : null
        }
      />
      <span className="rail-spacer" />
      <RailButton
        icon={Search}
        label="Quick open"
        shortcut="palette"
        onClick={onPalette}
      />
      {folder}
      <RailButton
        icon={Keyboard}
        label="Keyboard shortcuts"
        shortcut="help"
        onClick={onHelp}
      />
      <RailButton
        icon={Settings}
        label="Settings"
        shortcut="settings"
        onClick={onSettings}
      />
    </nav>
  );
}
