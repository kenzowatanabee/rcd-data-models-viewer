import { ChevronDown, TableOfContents } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from 'react';

import { activeHeading, type OutlineItem } from './outline';
import { docHash } from './route';

/** The heading element for `anchor` inside the doc, if any. */
export function findTarget(
  root: HTMLElement | null,
  anchor: string,
): HTMLElement | null {
  if (root === null) return null;
  for (const id of [anchor, `user-content-${anchor}`]) {
    const found = root.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (found) return found;
  }
  return null;
}

/**
 * The id of the section being read, following the scroll. `offset` is how
 * far below the scroller's top a heading counts as reached.
 */
export function useScrollSpy(
  scrollRef: RefObject<HTMLElement | null>,
  rootRef: RefObject<HTMLElement | null>,
  items: OutlineItem[],
  offset: number,
): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const scroller = scrollRef.current;
    if (scroller === null || items.length === 0) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = scroller.getBoundingClientRect().top;
      const tops = items.map((item) => {
        const element = findTarget(rootRef.current, item.id);
        if (element === null) return null;
        const rect = element.getBoundingClientRect();
        // Inside a closed <details>: not laid out
        if (rect.width === 0 && rect.height === 0) return null;
        return rect.top - top;
      });
      const atBottom =
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
      const index = activeHeading(
        tops,
        offset,
        scroller.clientHeight,
        atBottom,
      );
      setActive(index === -1 ? null : (items[index]?.id ?? null));
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener('scroll', schedule, { passive: true });
    // <details> toggles and late diagrams move the headings
    const observer = new ResizeObserver(schedule);
    if (rootRef.current) observer.observe(rootRef.current);
    return () => {
      scroller.removeEventListener('scroll', schedule);
      observer.disconnect();
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [scrollRef, rootRef, items, offset]);
  return active;
}

interface ListProps {
  file: string;
  items: OutlineItem[];
  active: string | null;
  /** Scrolls to a section when its link would not change the address. */
  onSelect: (id: string) => void;
  /** Keep the active entry in view inside this list's own scroller. */
  follow?: boolean;
  /** Called on any pick, to close a menu. */
  onPick?: () => void;
}

function OutlineList({
  file,
  items,
  active,
  onSelect,
  follow,
  onPick,
}: ListProps) {
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (!follow || active === null) return;
    const list = listRef.current;
    const link = list?.querySelector<HTMLElement>('[aria-current]');
    const scroller = list?.closest<HTMLElement>('.outline-scroll');
    if (!link || !scroller) return;
    const linkRect = link.getBoundingClientRect();
    const boxRect = scroller.getBoundingClientRect();
    // Only this list scrolls; scrollIntoView could move the page too
    if (linkRect.top < boxRect.top + 8) {
      scroller.scrollTop -= boxRect.top + 8 - linkRect.top;
    } else if (linkRect.bottom > boxRect.bottom - 8) {
      scroller.scrollTop += linkRect.bottom - boxRect.bottom + 8;
    }
  }, [active, follow]);

  const onClick = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
      return;
    // The same address again changes nothing, so scroll here instead
    if (window.location.hash === docHash(file, id)) {
      event.preventDefault();
      onSelect(id);
    }
    onPick?.();
  };

  return (
    <ol className="outline-list" ref={listRef}>
      {items.map((item) => (
        <li key={item.id}>
          <a
            className={`outline-link depth-${item.depth}`}
            href={docHash(file, item.id)}
            aria-current={item.id === active ? 'location' : undefined}
            onClick={(event) => onClick(event, item.id)}
          >
            {item.text}
          </a>
        </li>
      ))}
    </ol>
  );
}

/** "On this page", as a section of the right-hand column. */
export function OutlinePanel(props: ListProps) {
  return (
    <nav className="aside-section outline" aria-labelledby="outline-title">
      <div className="aside-header">
        <h2 id="outline-title">On this page</h2>
        <span className="count">{props.items.length}</span>
      </div>
      <div className="outline-scroll">
        <OutlineList {...props} follow />
      </div>
    </nav>
  );
}

/** "On this page" for narrow windows: a sticky bar with a drop-down list. */
export function OutlineMenu(props: ListProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const current = props.items.find((item) => item.id === props.active);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="outline-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="outline-menu-button"
        aria-expanded={open}
        aria-controls="outline-menu-list"
        onClick={() => setOpen((value) => !value)}
      >
        <TableOfContents size={14} aria-hidden="true" />
        <span className="outline-menu-label">On this page</span>
        {current && (
          <span className="outline-menu-current">{current.text}</span>
        )}
        <ChevronDown size={14} aria-hidden="true" className="chevron" />
      </button>
      {open && (
        <div
          className="outline-menu-popover outline-scroll"
          id="outline-menu-list"
        >
          <OutlineList {...props} follow onPick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
