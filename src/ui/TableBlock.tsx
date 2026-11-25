import { Search, X } from 'lucide-react';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from 'react';

import { hastText, type HastNode } from './headingIds';
import {
  FILTER_THRESHOLD,
  clippedEdges,
  countMatches,
  numericColumns,
  rowMatches,
} from './tableModel';

interface TableInfo {
  query: string;
  bodyRows: WeakSet<object>;
  columnOf: WeakMap<object, number>;
  numeric: boolean[];
}

const TableContext = createContext<TableInfo | null>(null);

const elements = (node: HastNode | undefined, tag: string): HastNode[] =>
  (node?.children ?? []).filter(
    (child) => child.type === 'element' && child.tagName === tag,
  );

/** Rows, cells and column indexes of a table, read from its hast node. */
function analyse(table: HastNode | undefined) {
  const bodyRows = new WeakSet<object>();
  const columnOf = new WeakMap<object, number>();
  const texts: string[] = [];
  const cells: string[][] = [];
  for (const section of [
    ...elements(table, 'thead'),
    ...elements(table, 'tbody'),
  ]) {
    const isBody = section.tagName === 'tbody';
    for (const row of elements(section, 'tr')) {
      const rowCells = (row.children ?? []).filter(
        (cell) =>
          cell.type === 'element' &&
          (cell.tagName === 'td' || cell.tagName === 'th'),
      );
      rowCells.forEach((cell, index) => columnOf.set(cell, index));
      if (isBody) {
        bodyRows.add(row);
        texts.push(hastText(row));
        cells.push(rowCells.map((cell) => hastText(cell)));
      }
    }
  }
  return { bodyRows, columnOf, texts, numeric: numericColumns(cells) };
}

/** Shows shadows on the edges where the table is cut off. */
function useClipEdges(ref: RefObject<HTMLDivElement | null>) {
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const box = ref.current;
    if (box === null) return;
    const update = () => {
      const next = clippedEdges(
        box.scrollLeft,
        box.clientWidth,
        box.scrollWidth,
      );
      setEdges((current) =>
        current.left === next.left && current.right === next.right
          ? current
          : next,
      );
    };
    update();
    box.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(box);
    if (box.firstElementChild) observer.observe(box.firstElementChild);
    return () => {
      box.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [ref]);
  return edges;
}

export function TableBlock({
  node,
  children,
}: {
  node: HastNode | undefined;
  children: ReactNode;
}) {
  const info = useMemo(() => analyse(node), [node]);
  const [query, setQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const edges = useClipEdges(scrollRef);
  const inputId = useId();
  const total = info.texts.length;
  const filterable = total > FILTER_THRESHOLD;
  const shown = filterable ? countMatches(query, info.texts) : total;
  const context = useMemo(
    (): TableInfo => ({ ...info, query: filterable ? query : '' }),
    [info, query, filterable],
  );

  return (
    <div className="table-block">
      {filterable && (
        <div className="table-tools">
          <label className="visually-hidden" htmlFor={inputId}>
            Filter rows
          </label>
          <div className="search-field table-filter">
            <Search size={13} aria-hidden="true" />
            <input
              id={inputId}
              className="input input-sm"
              type="search"
              placeholder={`Filter ${total} rows`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && query !== '') {
                  event.stopPropagation();
                  setQuery('');
                }
              }}
            />
            {query !== '' && (
              <span className="search-field-end">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-icon"
                  onClick={() => setQuery('')}
                  aria-label="Clear the filter"
                >
                  <X size={13} aria-hidden="true" />
                </button>
              </span>
            )}
          </div>
          <span className="table-count tabular" aria-live="polite">
            {query.trim() === ''
              ? `${total} rows`
              : `${shown} of ${total} rows`}
          </span>
        </div>
      )}
      <div
        className="table-frame"
        data-clip-left={edges.left || undefined}
        data-clip-right={edges.right || undefined}
      >
        <div
          className="table-scroll"
          ref={scrollRef}
          // Scrollable regions need to be reachable by keyboard
          tabIndex={edges.left || edges.right ? 0 : undefined}
        >
          <TableContext.Provider value={context}>
            <table>{children}</table>
          </TableContext.Provider>
        </div>
        {filterable && shown === 0 && (
          <p className="table-empty">No rows match “{query.trim()}”.</p>
        )}
      </div>
    </div>
  );
}

type RowProps = ComponentProps<'tr'> & { node?: HastNode };

export function TableRow({ node, children, ...rest }: RowProps) {
  const info = useContext(TableContext);
  const hidden =
    info !== null &&
    node !== undefined &&
    info.query !== '' &&
    info.bodyRows.has(node) &&
    !rowMatches(info.query, hastText(node));
  return (
    <tr {...rest} hidden={hidden || undefined}>
      {children}
    </tr>
  );
}

type CellProps = ComponentProps<'td'> & { node?: HastNode };

/** Right-aligns the cells of columns that hold only numbers. */
export function tableCell(Tag: 'td' | 'th') {
  return function Cell({ node, style, children, ...rest }: CellProps) {
    const info = useContext(TableContext);
    const column = node === undefined ? undefined : info?.columnOf.get(node);
    const numeric = column !== undefined && info?.numeric[column] === true;
    return (
      <Tag
        {...rest}
        style={numeric ? { ...style, textAlign: 'right' } : style}
        className={numeric ? 'numeric' : undefined}
      >
        {children}
      </Tag>
    );
  };
}
