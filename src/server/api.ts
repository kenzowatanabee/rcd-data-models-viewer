import type { Graph } from '../indexer/types';

/** Body of `GET /api/graph`. */
export interface GraphResponse {
  /** Absolute path of the docs repo clone being viewed. */
  docsPath: string;
  graph: Graph;
  /** Viewable Markdown outside the graph: README, docs/*.md, guides/*.md. */
  otherDocs: string[];
}

/** Custom HMR event sent when Markdown in the docs repo changes. */
export const DOCS_CHANGED_EVENT = 'docs:changed';

export interface DocsChangedPayload {
  files: string[];
}

/** Body of `GET /api/headings`: the headings of every viewable doc. */
export interface HeadingsResponse {
  docs: {
    file: string;
    headings: { id: string; text: string; depth: number }[];
  }[];
}
