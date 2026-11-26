import net from 'node:net';

import react from '@vitejs/plugin-react';
import { createServer, type ViteDevServer } from 'vite';

import { cspPlugin } from './csp';
import { createDocsApi } from './docsApiPlugin';
import { hostCheckPlugin } from './hostCheck';

export interface DocsServerOptions {
  /** The folder holding the UI's index.html. */
  uiRoot: string;
  /** The docs repo to serve, or null to start with none. */
  repo: string | null;
  /**
   * `localhost` for `pnpm start` in a browser; the desktop app binds
   * 127.0.0.1 only, on a port it picked.
   */
  host: 'localhost' | '127.0.0.1';
  /** Required and taken strictly when given; else Vite's default search. */
  port?: number;
  /** Adds the desktop window's Content-Security-Policy to the page. */
  csp?: boolean;
  quiet?: boolean;
}

export interface DocsServer {
  vite: ViteDevServer;
  url: string;
  port: number;
  setRepo: (repo: string | null) => void;
  /** Reloads the index and the open doc in the page. */
  refreshDocs: () => void;
  close: () => Promise<void>;
}

const HOST_NAMES = {
  localhost: ['localhost', '127.0.0.1', '[::1]'],
  '127.0.0.1': ['127.0.0.1'],
} as const;

/** The Vite dev server with the docs API; shared by `pnpm start` and the app. */
export async function startDocsServer(
  options: DocsServerOptions,
): Promise<DocsServer> {
  const api = createDocsApi(options.repo);
  let boundPort = options.port ?? 0;
  const vite = await createServer({
    configFile: false,
    root: options.uiRoot,
    clearScreen: options.quiet === true ? false : undefined,
    logLevel: options.quiet === true ? 'warn' : undefined,
    plugins: [
      hostCheckPlugin(HOST_NAMES[options.host]),
      react(),
      api.plugin,
      ...(options.csp === true
        ? [cspPlugin(() => ({ host: options.host, port: boundPort }))]
        : []),
    ],
    server: {
      host: options.host,
      ...(options.port === undefined
        ? {}
        : { port: options.port, strictPort: true }),
    },
  });
  await vite.listen();
  const address = vite.httpServer?.address();
  if (address === null || typeof address !== 'object') {
    await vite.close();
    throw new Error('The server did not report its port');
  }
  boundPort = address.port;
  return {
    vite,
    url: `http://${options.host}:${boundPort}`,
    port: boundPort,
    setRepo: api.setRepo,
    refreshDocs: api.refresh,
    close: () => vite.close(),
  };
}

function canListen(host: string, port: number): Promise<number | null> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(null));
    probe.listen({ host, port, exclusive: true }, () => {
      const address = probe.address();
      const bound =
        typeof address === 'object' && address ? address.port : null;
      probe.close(() => resolve(bound));
    });
  });
}

/** `preferred` when it is free, else any free port the OS hands out. */
export async function findFreePort(
  host: string,
  preferred: number | null,
): Promise<number> {
  if (preferred !== null) {
    const port = await canListen(host, preferred);
    if (port !== null) return port;
  }
  const port = await canListen(host, 0);
  if (port === null) throw new Error(`No free port on ${host}`);
  return port;
}
