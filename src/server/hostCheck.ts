import type { Plugin } from 'vite';

/**
 * True when a request's `Host` header names the server itself: one of
 * `names` (lower case, IPv6 in brackets) with the port it is bound to. A page
 * on any other site that resolves its own name to 127.0.0.1 (DNS rebinding)
 * sends its own name here and is turned away.
 */
export function isAllowedHost(
  host: string | undefined,
  port: number,
  names: readonly string[],
): boolean {
  if (host === undefined) return false;
  const value = host.trim().toLowerCase();
  return names.some(
    (name) => value === `${name}:${port}` || (port === 80 && value === name),
  );
}

/** Rejects requests for any other host before Vite or the API sees them. */
export function hostCheckPlugin(names: readonly string[]): Plugin {
  return {
    name: 'host-check',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const address = server.httpServer?.address();
        const port =
          address !== null && typeof address === 'object' ? address.port : -1;
        if (isAllowedHost(req.headers.host, port, names)) return next();
        res.statusCode = 403;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Forbidden: unexpected Host header');
      });
    },
  };
}
