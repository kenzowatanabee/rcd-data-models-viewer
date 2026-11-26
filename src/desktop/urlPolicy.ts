/** The URL to hand to the OS browser, or null: only http and https leave. */
export function externalUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.username !== '' || parsed.password !== '') return null;
  return parsed.href;
}

/** True for a URL on the app's own origin, such as `http://127.0.0.1:4100`. */
export function isAppUrl(url: string, appOrigin: string): boolean {
  try {
    return new URL(url).origin === appOrigin;
  } catch {
    return false;
  }
}

export type NavigationDecision =
  | { action: 'allow' }
  | { action: 'external'; url: string }
  | { action: 'deny' };

/** What to do when the page tries to navigate or open a window to `url`. */
export function navigationDecision(
  url: string,
  appOrigin: string,
): NavigationDecision {
  if (isAppUrl(url, appOrigin)) return { action: 'allow' };
  const external = externalUrl(url);
  return external === null
    ? { action: 'deny' }
    : { action: 'external', url: external };
}
