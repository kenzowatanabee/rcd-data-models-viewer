import { useState } from 'react';

import type { GraphNode } from '../indexer/types';
import { captionOf } from './graphNodes';
import { findNodes } from './graphModel';
import { useAriaKeys } from './ShortcutLayer';

/** Search box that picks a node by name or alias. */
export function GraphFind({
  nodes,
  onPick,
}: {
  nodes: GraphNode[];
  onPick: (id: string) => void;
}) {
  const filterKeys = useAriaKeys('filter');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const hits = findNodes(nodes, query);
  const current = Math.min(active, Math.max(hits.length - 1, 0));

  const pick = (node: GraphNode | undefined) => {
    if (node === undefined) return;
    onPick(node.id);
    setQuery(node.name);
    setOpen(false);
  };

  return (
    <div className="graph-find">
      <input
        id="graph-find-input"
        type="search"
        className="input"
        placeholder="Find a node by name or alias"
        aria-label="Find a node by name or alias"
        aria-keyshortcuts={filterKeys}
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls="graph-find-results"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive(Math.min(current + 1, hits.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive(Math.max(current - 1, 0));
          } else if (event.key === 'Enter') {
            pick(hits[current]);
          } else if (event.key === 'Escape') {
            // First Esc closes the list, a second clears the box
            if (!open || query === '') setQuery('');
            setOpen(false);
            event.stopPropagation();
          }
        }}
      />
      {open && query.trim() !== '' && (
        <ul
          className="graph-find-results"
          id="graph-find-results"
          role="listbox"
        >
          {hits.length === 0 && (
            <li className="graph-find-empty" role="presentation">
              <span>No name or alias matches “{query.trim()}”.</span>
              <span className="muted">
                Datasets, pipelines and undocumented names are all searched.
              </span>
            </li>
          )}
          {hits.map((node, index) => (
            <li
              key={node.id}
              role="option"
              aria-selected={index === current}
              // mousedown, so the pick happens before the input loses focus
              onMouseDown={(event) => {
                event.preventDefault();
                pick(node);
              }}
            >
              <span className="nav-label">{node.name}</span>
              <span className="tag">{captionOf(node)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
