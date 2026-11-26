/**
 * In-app navigation. Views ask for an address with `navigate`; the tabs
 * (App.tsx) apply it to the active tab and then mirror the active tab's
 * address into the location bar with `replaceState`, so the browser's own
 * history never grows: back and forward are per tab.
 */

export interface NavigateDetail {
  hash: string;
  /** Same visit, another address (a view switch, a selection). */
  replace: boolean;
  /** Open in a new tab; `background` leaves the current one active. */
  newTab: 'focus' | 'background' | null;
}

const EVENT = 'rcd-navigate';

export function navigate(
  hash: string,
  options: Partial<Omit<NavigateDetail, 'hash'>> = {},
): void {
  const detail: NavigateDetail = {
    hash,
    replace: options.replace ?? false,
    newTab: options.newTab ?? null,
  };
  window.dispatchEvent(new CustomEvent<NavigateDetail>(EVENT, { detail }));
}

export function onNavigate(listener: (detail: NavigateDetail) => void) {
  const wrapped = (event: Event) =>
    listener((event as CustomEvent<NavigateDetail>).detail);
  window.addEventListener(EVENT, wrapped);
  return () => window.removeEventListener(EVENT, wrapped);
}

export interface ClickInput {
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/**
 * What a click on an in-app link does: plain opens here, Ctrl/⌘ or the
 * middle button opens a background tab, Shift a focused new tab. Null
 * leaves the click to the browser.
 */
export function linkIntent(
  click: ClickInput,
  mac: boolean,
): NavigateDetail['newTab'] | 'here' | null {
  if (click.altKey) return null;
  if (click.button === 1) return 'background';
  if (click.button !== 0) return null;
  const mod = mac ? click.metaKey : click.ctrlKey;
  if (click.shiftKey) return 'focus';
  if (mod) return 'background';
  return 'here';
}

/** The in-app address a link points to, or null for other links. */
export function inAppHref(href: string | null): string | null {
  if (href === null) return null;
  return href === '#/' || href.startsWith('#/') ? href : null;
}
