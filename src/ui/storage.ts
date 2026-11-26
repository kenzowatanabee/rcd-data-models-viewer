import { useEffect, useState } from 'react';

// Storage can be missing or throw (private windows, blocked site data); the
// viewer then simply forgets settings between sessions.
export function readSetting(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

const SETTING_EVENT = 'rcd-setting';

export function writeSetting(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not persisted; the setting still applies for this session
  }
  // Views that read a setting once (Markdown wrap) follow Settings live
  window.dispatchEvent(
    new CustomEvent(SETTING_EVENT, { detail: { key, value } }),
  );
}

/** Calls `listener` with the new value whenever `key` is written. */
export function onSettingChange(
  key: string,
  listener: (value: string) => void,
) {
  const wrapped = (event: Event) => {
    const detail = (event as CustomEvent<{ key: string; value: string }>)
      .detail;
    if (detail.key === key) listener(detail.value);
  };
  window.addEventListener(SETTING_EVENT, wrapped);
  return () => window.removeEventListener(SETTING_EVENT, wrapped);
}

/** Removes every stored setting whose key starts with `prefix`. */
export function clearSettings(prefix: string): void {
  try {
    const store = window.localStorage;
    const keys = Array.from({ length: store.length }, (_, i) => store.key(i));
    for (const key of keys) {
      if (key !== null && key.startsWith(prefix)) store.removeItem(key);
    }
  } catch {
    // Nothing stored, or storage blocked
  }
}

/** True while the media query matches; follows changes. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => window.matchMedia(query).matches,
  );
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export const useReducedMotion = () =>
  useMediaQuery('(prefers-reduced-motion: reduce)');

// Per-tab memory: kept across reloads of this tab, forgotten when it closes
export function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSession(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Not kept; the choice still applies until the page reloads
  }
}
