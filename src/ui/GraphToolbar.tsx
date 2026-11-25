import {
  PanelRightClose,
  PanelRightOpen,
  SlidersHorizontal,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import type { GraphNode } from '../indexer/types';
import { VIEW_OPTIONS, changedOptions } from './graphChrome';
import { GraphFind } from './GraphFind';
import type { Depth } from './graphModel';
import { DEFAULT_GRAPH, type GraphRoute } from './route';

export interface GraphCounts {
  nodes: number;
  /** Links drawn as lines, and those shown as lookup tags instead. */
  links: number;
  tags: number;
}

interface Props {
  nodes: GraphNode[];
  route: GraphRoute;
  /** The node "Only this lineage" would lay out, if any. */
  target: string | null;
  /** Depth applies to a selection or a focused lineage only. */
  depthApplies: boolean;
  counts: GraphCounts | null;
  panelCollapsed: boolean;
  onFind: (id: string) => void;
  onView: (change: Partial<GraphRoute>) => void;
  onTogglePanel: () => void;
}

const DEPTHS: { value: Depth; label: string }[] = [
  { value: null, label: 'All' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
];

/** Find, view mode, depth, display options and the panel switch, in one row. */
export function GraphToolbar({
  nodes,
  route,
  target,
  depthApplies,
  counts,
  panelCollapsed,
  onFind,
  onView,
  onTogglePanel,
}: Props) {
  const { focus, depth } = route;
  const countsText =
    counts === null
      ? null
      : `${counts.nodes} nodes · ${counts.links} links${
          counts.tags > 0 ? ` + ${counts.tags} tags` : ''
        }`;
  return (
    <div className="graph-toolbar">
      <h1 className="visually-hidden">Lineage graph</h1>
      <GraphFind nodes={nodes} onPick={onFind} />
      <div className="segmented" role="group" aria-label="What to lay out">
        <button
          type="button"
          aria-pressed={focus === null}
          onClick={() => onView({ focus: null })}
        >
          Whole graph
        </button>
        <button
          type="button"
          aria-pressed={focus !== null}
          disabled={target === null}
          title={
            target === null
              ? 'Select a node first'
              : 'Lay out only what is upstream and downstream of the selection'
          }
          onClick={() => onView({ focus: target, node: target, to: null })}
        >
          Only this lineage
        </button>
      </div>
      {depthApplies && (
        <div
          className="segmented graph-depth"
          role="group"
          aria-label="Depth: how many datasets away to trace"
          title="How many datasets away to trace"
        >
          <span className="graph-depth-label" aria-hidden="true">
            Depth
          </span>
          {DEPTHS.map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={depth === option.value}
              aria-label={
                option.value === null
                  ? 'All depths'
                  : `${option.value} ${option.value === 1 ? 'dataset' : 'datasets'} away`
              }
              onClick={() => onView({ depth: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      <span className="graph-toolbar-spacer" />
      {countsText !== null && counts !== null && (
        <span
          className="graph-counts"
          data-testid="graph-counts"
          title={
            counts.tags > 0
              ? `${counts.links} links drawn, and ${counts.tags} links from shared lookups shown as tags on their readers`
              : undefined
          }
        >
          {countsText}
        </span>
      )}
      <ViewOptions route={route} onView={onView} />
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        aria-pressed={!panelCollapsed}
        aria-controls="graph-panel"
        aria-label={
          panelCollapsed ? 'Show the side panel' : 'Hide the side panel'
        }
        title={panelCollapsed ? 'Show the side panel' : 'Hide the side panel'}
        onClick={onTogglePanel}
      >
        {panelCollapsed ? (
          <PanelRightOpen size={16} aria-hidden="true" />
        ) : (
          <PanelRightClose size={16} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

/** A menu of the display options, each with a line saying what it does. */
function ViewOptions({
  route,
  onView,
}: {
  route: GraphRoute;
  onView: (change: Partial<GraphRoute>) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const changed = changedOptions(route);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    popoverRef.current?.querySelector<HTMLElement>('input')?.focus();
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !popoverRef.current?.contains(target) &&
        !buttonRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  return (
    <div className="graph-menu">
      <button
        ref={buttonRef}
        type="button"
        className="btn"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
      >
        <SlidersHorizontal size={14} aria-hidden="true" />
        View options
        {changed.length > 0 && (
          <span
            className="graph-menu-badge"
            aria-label={`${changed.length} changed`}
          >
            {changed.length}
          </span>
        )}
      </button>
      {open && (
        <div
          ref={popoverRef}
          id={id}
          className="graph-popover"
          role="dialog"
          aria-label="View options"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              close(true);
            }
          }}
          onBlur={(event) => {
            // Tabbing out of the menu closes it
            const next = event.relatedTarget as Node | null;
            if (
              next !== null &&
              !popoverRef.current?.contains(next) &&
              next !== buttonRef.current
            ) {
              setOpen(false);
            }
          }}
        >
          <p className="graph-popover-title">Show on the graph</p>
          <ul>
            {VIEW_OPTIONS.map((option) => (
              <li key={option.key}>
                <label className="graph-option-row">
                  <input
                    type="checkbox"
                    checked={route[option.key]}
                    aria-describedby={`${id}-${option.key}`}
                    onChange={(event) =>
                      onView({ [option.key]: event.target.checked })
                    }
                  />
                  <span>
                    <span className="graph-option-label">
                      {option.label}
                      {route[option.key] !== DEFAULT_GRAPH[option.key] && (
                        <span className="graph-option-changed">changed</span>
                      )}
                    </span>
                    <span
                      className="graph-option-hint"
                      id={`${id}-${option.key}`}
                    >
                      {option.hint}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {changed.length > 0 && (
            <div className="graph-popover-footer">
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() =>
                  onView(
                    Object.fromEntries(
                      changed.map((key) => [key, DEFAULT_GRAPH[key]]),
                    ),
                  )
                }
              >
                Reset to defaults
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
