import {
  ChevronDown,
  FileText,
  HeartPulse,
  House,
  Plus,
  Waypoints,
  X,
} from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react';

import { ContextMenu, type MenuItem } from './ContextMenu';
import type { TabKind } from './tabsModel';

export interface TabView {
  id: string;
  kind: TabKind;
  /** The name shown: a doc's name, "Lineage graph"... */
  title: string;
  /** A muted lead before the name (a shared prefix such as `RCD_`). */
  lead: string;
  /** Tooltip: the doc's path, or what the view shows. */
  detail: string;
  /** Layer or kind marker class, as in the sidebar; null for an icon. */
  marker: string | null;
  pinned: boolean;
}

interface Props {
  tabs: readonly TabView[];
  active: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onMove: (id: string, to: number) => void;
  menuFor: (id: string) => MenuItem[];
  newTabHint: string;
  closeHint: string;
}

const ICONS = {
  home: House,
  doc: FileText,
  graph: Waypoints,
  health: HeartPulse,
} as const;

function TabIcon({ tab }: { tab: TabView }) {
  if (tab.marker !== null) {
    return (
      <span className="tab-icon">
        <span className={`layer-marker ${tab.marker}`} aria-hidden="true" />
      </span>
    );
  }
  const Icon = ICONS[tab.kind];
  return (
    <span className="tab-icon">
      <Icon size={13} aria-hidden="true" />
    </span>
  );
}

interface Menu {
  x: number;
  y: number;
  label: string;
  items: MenuItem[];
}

/**
 * The tab strip: one tab per open view. Arrows move between tabs, Enter
 * shows one, Delete closes it, the context-menu key (or Shift+F10) opens
 * its menu; tabs are dragged to reorder.
 */
export function TabStrip({
  tabs,
  active,
  onActivate,
  onClose,
  onNew,
  onMove,
  menuFor,
  newTabHint,
  closeHint,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ left: false, right: false });
  const [menu, setMenu] = useState<Menu | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; to: number | null } | null>(
    null,
  );
  const overflowing = fade.left || fade.right;
  const tabbable = tabs.some((tab) => tab.id === focusId) ? focusId : active;

  const measure = () => {
    const box = scrollRef.current;
    if (box === null) return;
    const left = box.scrollLeft > 1;
    const right = box.scrollLeft + box.clientWidth < box.scrollWidth - 1;
    setFade((old) =>
      old.left === left && old.right === right ? old : { left, right },
    );
  };
  // Measured when the tabs change, on resize and on scroll; not on every
  // render, where a fade appearing could feed back into the measure
  useLayoutEffect(measure, [tabs.length, active]);
  useEffect(() => {
    const box = scrollRef.current;
    if (box === null) return;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // The active tab stays in sight
  useEffect(() => {
    scrollRef.current
      ?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(active)}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active, tabs.length]);

  const element = (id: string) =>
    scrollRef.current?.querySelector<HTMLElement>(
      `[data-tab-id="${CSS.escape(id)}"]`,
    ) ?? null;

  const openMenu = (id: string, x: number, y: number) => {
    const tab = tabs.find((other) => other.id === id);
    setMenu({ x, y, label: `Tab: ${tab?.title ?? ''}`, items: menuFor(id) });
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>, id: string) => {
    const at = tabs.findIndex((tab) => tab.id === id);
    const go = (index: number) => {
      const tab = tabs[(index + tabs.length) % tabs.length];
      if (tab === undefined) return;
      setFocusId(tab.id);
      element(tab.id)?.focus();
    };
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        return go(at - 1);
      case 'ArrowRight':
        event.preventDefault();
        return go(at + 1);
      case 'Home':
        event.preventDefault();
        return go(0);
      case 'End':
        event.preventDefault();
        return go(tabs.length - 1);
      case 'Enter':
      case ' ':
        event.preventDefault();
        return onActivate(id);
      case 'Delete':
        event.preventDefault();
        onClose(id);
        return;
      case 'ContextMenu':
      case 'F10':
        if (event.key === 'F10' && !event.shiftKey) return;
        event.preventDefault();
        {
          const box = event.currentTarget.getBoundingClientRect();
          openMenu(id, box.left, box.bottom);
        }
        return;
    }
  };

  const dropIndex = (event: DragEvent<HTMLElement>, index: number) => {
    const box = event.currentTarget.getBoundingClientRect();
    return event.clientX > box.left + box.width / 2 ? index + 1 : index;
  };

  return (
    <div className="tabstrip">
      <div
        ref={scrollRef}
        className={`tabstrip-scroll${fade.left ? ' fade-left' : ''}${fade.right ? ' fade-right' : ''}`}
        role="tablist"
        aria-label="Open tabs"
        onScroll={measure}
        onWheel={(event) => {
          // A vertical wheel scrolls the strip sideways
          const box = scrollRef.current;
          if (box === null || event.deltaX !== 0) return;
          box.scrollLeft += event.deltaY;
        }}
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === active;
          const dropBefore = drag !== null && drag.to === index;
          const dropAfter =
            drag !== null && drag.to === index + 1 && index === tabs.length - 1;
          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              id={`tab-${tab.id}`}
              role="tab"
              aria-selected={selected}
              aria-controls={`pane-${tab.id}`}
              tabIndex={tab.id === tabbable ? 0 : -1}
              title={tab.pinned ? `${tab.title}\n${tab.detail}` : tab.detail}
              className={`tab${selected ? ' is-active' : ''}${tab.pinned ? ' is-pinned' : ''}${dropBefore ? ' drop-before' : ''}${dropAfter ? ' drop-after' : ''}${drag?.id === tab.id ? ' is-dragging' : ''}`}
              draggable
              onClick={() => onActivate(tab.id)}
              onFocus={() => setFocusId(tab.id)}
              onMouseDown={(event) => {
                // No autoscroll on the middle button: it closes the tab
                if (event.button === 1) event.preventDefault();
              }}
              onAuxClick={(event) => {
                if (event.button !== 1) return;
                event.preventDefault();
                onClose(tab.id);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                openMenu(tab.id, event.clientX, event.clientY);
              }}
              onKeyDown={(event) => onKey(event, tab.id)}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', tab.title);
                setDrag({ id: tab.id, to: null });
              }}
              onDragOver={(event) => {
                if (drag === null) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                const to = dropIndex(event, index);
                if (to !== drag.to) setDrag({ ...drag, to });
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (drag === null) return;
                const from = tabs.findIndex((other) => other.id === drag.id);
                const to = dropIndex(event, index);
                onMove(drag.id, to > from ? to - 1 : to);
                setDrag(null);
              }}
              onDragEnd={() => setDrag(null)}
            >
              <TabIcon tab={tab} />
              {tab.pinned ? (
                <span className="visually-hidden">{tab.title}, pinned</span>
              ) : (
                <span className="tab-title">
                  {tab.lead !== '' && (
                    <span className="tab-lead">{tab.lead}</span>
                  )}
                  {tab.title.slice(tab.lead.length)}
                </span>
              )}
              {!tab.pinned && (
                <button
                  type="button"
                  className="tab-close"
                  tabIndex={-1}
                  aria-label={`Close ${tab.title}`}
                  title={`Close${selected ? closeHint : ''}`}
                  draggable={false}
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose(tab.id);
                  }}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-icon btn-sm tabstrip-new"
        aria-label="New tab"
        title={`New tab${newTabHint}`}
        onClick={onNew}
      >
        <Plus size={15} aria-hidden="true" />
      </button>
      {/* Always laid out, so showing it cannot change what overflows */}
      {
        <button
          type="button"
          className={`btn btn-ghost btn-icon btn-sm tabstrip-list${overflowing ? '' : ' is-idle'}`}
          aria-hidden={!overflowing}
          tabIndex={overflowing ? 0 : -1}
          aria-label={`All tabs (${tabs.length})`}
          title="All tabs"
          aria-haspopup="menu"
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            setMenu({
              x: box.right - 260,
              y: box.bottom + 4,
              label: 'All tabs',
              items: tabs.map((tab) => ({
                label: tab.pinned ? `${tab.title} (pinned)` : tab.title,
                checked: tab.id === active,
                onSelect: () => onActivate(tab.id),
              })),
            });
          }}
        >
          <ChevronDown size={15} aria-hidden="true" />
        </button>
      }
      {menu !== null && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={menu.label}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
