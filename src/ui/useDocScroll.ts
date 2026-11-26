import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from 'react';

import { findTarget } from './OutlinePanel';
import { recalledScroll, rememberScroll } from './scrollMemory';
import { useReducedMotion } from './storage';

/** Where `element` must scroll to for `target` to sit at its scroll margin. */
function topFor(scroller: HTMLElement, target: HTMLElement): number {
  const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
  return (
    target.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top +
    scroller.scrollTop -
    margin
  );
}

/** Opens the `<details>` blocks around `element`, so it can be seen. */
function reveal(element: HTMLElement) {
  for (
    let details = element.closest('details');
    details !== null;
    details = details.parentElement?.closest('details') ?? null
  ) {
    details.open = true;
  }
}

/**
 * A target inside a table's own scroller is scrolled into view there; the
 * page then lines up the table. Returns what the page should line up.
 */
function placeInTable(element: HTMLElement): HTMLElement {
  const inner = element.closest<HTMLElement>('.table-scroll');
  if (inner === null || inner.scrollHeight <= inner.clientHeight) {
    return element;
  }
  const head =
    inner.querySelector('thead')?.getBoundingClientRect().height ?? 0;
  inner.scrollTop +=
    element.getBoundingClientRect().top -
    inner.getBoundingClientRect().top -
    head;
  return inner.closest<HTMLElement>('.table-block') ?? inner;
}

/** Smooth scrolling only for short jumps; long ones would crawl. */
const animate = (scroller: HTMLElement, top: number) =>
  Math.abs(scroller.scrollTop - top) < 3 * scroller.clientHeight;

/** How long late layout (diagrams) may still move the target. */
const SETTLE_MS = 2500;

/**
 * Scroll position of a doc page:
 * - back/forward return to where the page was (per tab history entry,
 *   named by `scrollKey`), as does a tab restored after a reload;
 * - a new address with `#anchor` lands on that heading, below sticky bars;
 * - any other new address starts at the top;
 * - a live refresh (same file and anchor) leaves the position alone.
 * Returns `scrollTo(id)` for in-page jumps that do not change the address.
 */
export function useDocScroll({
  scrollRef,
  rootRef,
  file,
  anchor,
  ready,
  view = '',
  scrollKey,
}: {
  scrollRef: RefObject<HTMLElement | null>;
  rootRef: RefObject<HTMLElement | null>;
  file: string;
  anchor: string | null;
  ready: boolean;
  /** What is shown of the doc (rendered or source); a change re-places it. */
  view?: string;
  /** The tab's current history entry. */
  scrollKey: string;
}): (id: string) => void {
  const reducedMotion = useReducedMotion();
  const keyRef = useRef<string | null>(null);
  const shownFile = useRef<string | null>(null);
  const liveKey = useRef(scrollKey);
  useLayoutEffect(() => {
    liveKey.current = scrollKey;
  }, [scrollKey]);

  // Remember the position under the current entry while reading
  useEffect(() => {
    const scroller = scrollRef.current;
    if (scroller === null) return;
    const onScroll = () => {
      // The address can change before React shows the next doc; a scroll
      // then belongs to no placed entry and must not be saved
      const key = keyRef.current;
      if (key !== null && liveKey.current === key) {
        rememberScroll(key, scroller.scrollTop);
      }
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [scrollRef]);

  // On a new address, stop saving until it is placed: clamping while the
  // next doc loads must not overwrite the last entry's position
  useLayoutEffect(() => {
    keyRef.current = null;
  }, [file, anchor, view, scrollKey]);

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!ready || scroller === null) return;
    const key = scrollKey;
    const saved = recalledScroll(key);
    const sameDoc = shownFile.current === file;
    shownFile.current = file;

    const target = (): number | null => {
      if (saved !== undefined) return saved;
      if (anchor === null) return 0;
      const element = findTarget(rootRef.current, anchor);
      if (element === null) return null;
      reveal(element);
      return topFor(scroller, placeInTable(element));
    };
    const first = target();
    const smooth =
      sameDoc &&
      saved === undefined &&
      !reducedMotion &&
      first !== null &&
      animate(scroller, first);
    if (first !== null) {
      scroller.scrollTo({ top: first, behavior: smooth ? 'smooth' : 'auto' });
    }
    keyRef.current = key;
    if (first !== null) rememberScroll(key, first);
    if (smooth || (saved === undefined && anchor === null)) return;

    // Diagrams render after the text and push content down; keep the
    // target in place until the reader takes over or things settle
    let settled = false;
    const stop = () => {
      settled = true;
    };
    const root = rootRef.current;
    const observer = new ResizeObserver(() => {
      if (settled) return;
      const top = target();
      if (top !== null && Math.abs(scroller.scrollTop - top) > 1) {
        scroller.scrollTo({ top });
      }
    });
    if (root) observer.observe(root);
    const events = ['wheel', 'pointerdown', 'keydown', 'touchstart'] as const;
    for (const name of events) {
      scroller.addEventListener(name, stop, { passive: true });
    }
    const timer = window.setTimeout(stop, SETTLE_MS);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      for (const name of events) scroller.removeEventListener(name, stop);
    };
  }, [file, anchor, ready, view, scrollKey, scrollRef, rootRef, reducedMotion]);

  return useCallback(
    (id: string) => {
      const scroller = scrollRef.current;
      const element = findTarget(rootRef.current, id);
      if (scroller === null || element === null) return;
      reveal(element);
      const top = topFor(scroller, placeInTable(element));
      scroller.scrollTo({
        top,
        behavior: !reducedMotion && animate(scroller, top) ? 'smooth' : 'auto',
      });
    },
    [scrollRef, rootRef, reducedMotion],
  );
}
