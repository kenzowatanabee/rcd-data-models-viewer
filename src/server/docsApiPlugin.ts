import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

import type { Plugin } from 'vite';

import { buildGraph } from '../indexer/buildGraph';
import {
  DOCS_CHANGED_EVENT,
  type DocsChangedPayload,
  type GraphResponse,
  type HeadingsResponse,
} from './api';
import { validateDocPath } from './docPath';
import { listOtherDocs } from './docsRepo';
import { extractHeadings } from './headings';

function send(
  res: ServerResponse,
  status: number,
  type: string,
  body: string,
): void {
  res.statusCode = status;
  res.setHeader('Content-Type', `${type}; charset=utf-8`);
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

const sendError = (res: ServerResponse, status: number, error: string) =>
  send(res, status, 'application/json', JSON.stringify({ error }));

function isInside(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return (
    relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
  );
}

/** Serves the docs repo at `repo` under `/api` and reports Markdown edits. */
export function docsApiPlugin(repo: string): Plugin {
  const root = path.resolve(repo);
  let cached: GraphResponse | null = null;
  let cachedHeadings: HeadingsResponse | null = null;

  const graphResponse = (): GraphResponse => {
    cached ??= {
      docsPath: root,
      graph: buildGraph(root),
      otherDocs: listOtherDocs(root),
    };
    return cached;
  };

  const handleGraph = (res: ServerResponse) => {
    try {
      send(res, 200, 'application/json', JSON.stringify(graphResponse()));
    } catch (error) {
      sendError(res, 500, (error as Error).message);
    }
  };

  /** The file's text, or null unless it is a Markdown file in the repo. */
  const readDoc = (file: string): string | null => {
    let real: string;
    try {
      real = fs.realpathSync(path.join(root, ...file.split('/')));
    } catch {
      return null;
    }
    // A symlink inside the repo could still point outside it
    if (!isInside(fs.realpathSync(root), real) || !fs.statSync(real).isFile()) {
      return null;
    }
    return fs.readFileSync(real, 'utf8');
  };

  const handleDoc = (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const checked = validateDocPath(url.searchParams.get('file'));
    if (!checked.ok) {
      sendError(res, checked.status, checked.error);
      return;
    }
    const text = readDoc(checked.file);
    if (text === null) {
      sendError(res, 404, `${checked.file} not found`);
      return;
    }
    send(res, 200, 'text/markdown', text);
  };

  // Built once from the docs the graph lists and kept until a doc changes,
  // so quick open can search headings without fetching every doc
  const headingsResponse = (): HeadingsResponse => {
    if (cachedHeadings !== null) return cachedHeadings;
    const { graph, otherDocs } = graphResponse();
    const files = [
      ...graph.nodes.flatMap((node) => (node.file === null ? [] : [node.file])),
      ...otherDocs,
    ];
    const docs: HeadingsResponse['docs'] = [];
    for (const file of new Set(files)) {
      const checked = validateDocPath(file);
      const text = checked.ok ? readDoc(checked.file) : null;
      if (text !== null) docs.push({ file, headings: extractHeadings(text) });
    }
    cachedHeadings = { docs };
    return cachedHeadings;
  };

  const handleHeadings = (res: ServerResponse) => {
    try {
      send(res, 200, 'application/json', JSON.stringify(headingsResponse()));
    } catch (error) {
      sendError(res, 500, (error as Error).message);
    }
  };

  return {
    name: 'docs-api',
    configureServer(server) {
      server.middlewares.use('/api/graph', (req, res, next) => {
        if (req.method !== 'GET') return next();
        handleGraph(res);
      });
      server.middlewares.use('/api/doc', (req, res, next) => {
        if (req.method !== 'GET') return next();
        handleDoc(req, res);
      });
      server.middlewares.use('/api/headings', (req, res, next) => {
        if (req.method !== 'GET') return next();
        handleHeadings(res);
      });

      // Vite's watcher ignores .git and node_modules; it does nothing else
      // with these files since no module imports them.
      server.watcher.add(root);
      let pending = new Set<string>();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onChange = (file: string) => {
        if (!file.toLowerCase().endsWith('.md') || !isInside(root, file)) {
          return;
        }
        pending.add(path.relative(root, file).split(path.sep).join('/'));
        clearTimeout(timer);
        // Editors often write a file in several steps
        timer = setTimeout(() => {
          cached = null;
          cachedHeadings = null;
          const payload: DocsChangedPayload = { files: [...pending].sort() };
          pending = new Set();
          server.ws.send({
            type: 'custom',
            event: DOCS_CHANGED_EVENT,
            data: payload,
          });
        }, 150);
      };
      server.watcher.on('add', onChange);
      server.watcher.on('change', onChange);
      server.watcher.on('unlink', onChange);
    },
  };
}
