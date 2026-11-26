import { CornerDownLeft, Hash, Search, Terminal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { ModalDialog } from './Dialog';
import {
  recentRows,
  searchPalette,
  type PaletteItem,
  type ResultGroup,
  type ResultRow,
} from './paletteItems';
import { highlightParts } from './quickMatch';
import { nextIndex } from './settings';
import { IS_MAC, Keys } from './ShortcutLayer';

interface Props {
  items: readonly PaletteItem[];
  /** Commands for where the reader is; shown before typing too. */
  commands: readonly PaletteItem[];
  recent: readonly string[];
  /** Still loading the heading index. */
  headingsPending: boolean;
  /** `inGraph`: Ctrl/⌘+Enter, open the node in the graph instead. */
  onRun: (item: PaletteItem, inGraph: boolean) => void;
  onClose: () => void;
  /** Docs open in a tab, marked in the results. */
  open?: ReadonlySet<string>;
}

function Highlighted({ text, at }: { text: string; at: readonly number[] }) {
  if (at.length === 0) return <>{text}</>;
  return (
    <>
      {highlightParts(text, at).map((part, index) =>
        part.hit ? <mark key={index}>{part.text}</mark> : part.text,
      )}
    </>
  );
}

function RowContent({ row, isOpen }: { row: ResultRow; isOpen: boolean }) {
  const { item, highlights } = row;
  const on = (field: number) =>
    highlights.find((highlight) => highlight.field === field)?.at ?? [];
  // A match on an alias or path is shown under the name, highlighted
  const other = highlights.find(
    (highlight) => highlight.field > 0 && item.kind !== 'heading',
  );
  const otherField = other === undefined ? undefined : item.fields[other.field];
  let icon: ReactNode = null;
  if (item.kind === 'heading') icon = <Hash size={13} aria-hidden="true" />;
  else if (item.kind === 'command') {
    icon = <Terminal size={13} aria-hidden="true" />;
  } else if (item.marker !== null) {
    icon = (
      <span className={`layer-marker ${item.marker}`} aria-hidden="true" />
    );
  }
  return (
    <>
      <span className="palette-icon">{icon}</span>
      <span className="palette-text">
        <span className="palette-label">
          <Highlighted text={item.label} at={on(0)} />
        </span>
        {otherField !== undefined && other !== undefined && (
          <span className="palette-alias">
            {otherField.tier === 1 ? 'alias ' : ''}
            <Highlighted text={otherField.text} at={other.at} />
          </span>
        )}
      </span>
      {isOpen && <span className="palette-open">Open in a tab</span>}
      {item.meta !== null && <span className="palette-meta">{item.meta}</span>}
    </>
  );
}

const optionId = (index: number) => `palette-option-${index}`;

/** Quick open: find a doc, a heading or a command and go there. */
export function Palette({
  items,
  commands,
  recent,
  headingsPending,
  onRun,
  onClose,
  open,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const all = useMemo(() => [...items, ...commands], [items, commands]);
  const groups = useMemo((): ResultGroup[] => {
    if (query.trim() !== '') return searchPalette(query, all);
    const recentList = recentRows(recent, all);
    return [
      ...(recentList.length > 0
        ? [{ id: 'recent', title: 'Recent', rows: recentList, hidden: 0 }]
        : []),
      {
        id: 'command',
        title: 'Commands',
        rows: commands.map((item) => ({ item, highlights: [] })),
        hidden: 0,
      },
    ];
  }, [query, all, recent, commands]);
  const rows = groups.flatMap((group) => group.rows);
  const current = Math.min(active, rows.length - 1);

  useEffect(() => {
    document
      .getElementById(optionId(current))
      ?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  const run = (row: ResultRow | undefined, inGraph: boolean) => {
    if (row !== undefined) onRun(row.item, inGraph);
  };

  // Each group's first row's position in the flat list
  const offsets = groups.map((_, at) =>
    groups.slice(0, at).reduce((sum, group) => sum + group.rows.length, 0),
  );
  return (
    <ModalDialog
      className="modal palette"
      label="Quick open"
      onClose={onClose}
      closeOnBackdrop
      initialFocus={inputRef}
    >
      <div className="palette-search">
        <Search size={16} aria-hidden="true" />
        <input
          ref={inputRef}
          className="palette-input"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-autocomplete="list"
          aria-activedescendant={
            rows.length > 0 ? optionId(current) : undefined
          }
          aria-label="Find a doc, heading or command"
          placeholder="Find a dataset, pipeline, doc, heading or command"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            const mod = IS_MAC ? event.metaKey : event.ctrlKey;
            if (event.key === 'Enter') {
              event.preventDefault();
              run(rows[current], mod);
            } else if (mod && event.key.toLowerCase() === 'k') {
              event.preventDefault();
              onClose();
            } else if (
              event.key === 'ArrowDown' ||
              event.key === 'ArrowUp' ||
              // Home and End move the caret while there is text, unless
              // Ctrl/⌘ is held
              ((event.key === 'Home' || event.key === 'End') &&
                (query === '' || mod))
            ) {
              const next = nextIndex(current, rows.length, event.key);
              if (next !== null) {
                event.preventDefault();
                setActive(next);
              }
            }
          }}
        />
        <kbd className="palette-esc">Esc</kbd>
      </div>
      <div
        id="palette-list"
        className="palette-list"
        role="listbox"
        aria-label="Results"
      >
        {groups.map((group, groupIndex) =>
          group.rows.length === 0 ? null : (
            <div
              key={group.id}
              role="group"
              aria-labelledby={`palette-group-${group.id}`}
              className="palette-group"
            >
              <div
                id={`palette-group-${group.id}`}
                className="palette-group-title"
                role="presentation"
              >
                {group.title}
                {group.hidden > 0 && (
                  <span className="muted"> · {group.hidden} more</span>
                )}
              </div>
              {group.rows.map((row, rowIndex) => {
                const at = (offsets[groupIndex] ?? 0) + rowIndex;
                return (
                  <div
                    key={row.item.id}
                    id={optionId(at)}
                    role="option"
                    aria-selected={at === current}
                    className="palette-option"
                    onMouseMove={() => {
                      if (at !== current) setActive(at);
                    }}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) =>
                      run(row, IS_MAC ? event.metaKey : event.ctrlKey)
                    }
                  >
                    <RowContent
                      row={row}
                      isOpen={
                        row.item.kind !== 'heading' &&
                        row.item.file !== null &&
                        (open?.has(row.item.file) ?? false)
                      }
                    />
                    {at === current && (
                      <CornerDownLeft
                        className="palette-enter"
                        size={13}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ),
        )}
        {rows.length === 0 && (
          <div className="palette-empty" role="status">
            <p>
              Nothing matches <strong>{query.trim()}</strong>.
            </p>
            <p className="muted">
              Names, aliases, paths and headings are searched; every word must
              match, in any order.
            </p>
          </div>
        )}
      </div>
      <div className="palette-footer muted">
        <span>
          <Keys chord="ArrowUp" />
          <Keys chord="ArrowDown" /> move
        </span>
        <span>
          <Keys chord="Enter" /> open
        </span>
        <span>
          <Keys chord="mod+Enter" /> open in the graph
        </span>
        {headingsPending && <span>Loading headings…</span>}
        <span className="visually-hidden" aria-live="polite">
          {query.trim() === '' ? '' : `${rows.length} results`}
        </span>
      </div>
    </ModalDialog>
  );
}
