export type DocKind = 'dataset' | 'pipeline';
export type NodeKind = DocKind | 'external';

/** The front-matter fields that point at another doc. */
export type RefField =
  'pipeline' | 'upstream' | 'downstream' | 'inputs' | 'outputs';

export interface GraphNode {
  /** Repo-relative path of the doc; `external:<name>` for undocumented names. */
  id: string;
  kind: NodeKind;
  name: string;
  aliases: string[];
  file: string | null;
  title: string | null;
  layer: string | null;
  platform: string | null;
  status: string | null;
  domoId: string | null;
  lastUpdated: string | null;
}

export interface GraphEdge {
  /** Data flows from `from` to `to`. */
  from: string;
  to: string;
  /** Every front-matter field that declares this edge, as `file#field`. */
  declaredBy: string[];
}

export type RefStatus =
  'exact' | 'alias' | 'normalised' | 'wrong-kind' | 'ambiguous' | 'unresolved';

export interface Reference {
  file: string;
  field: RefField;
  ref: string;
  status: RefStatus;
  /** Node the reference points at; null when ambiguous. */
  target: string | null;
  /** Docs the name could mean, when ambiguous. */
  candidates: string[];
}

export interface OneSidedLink {
  from: string;
  to: string;
  declaredBy: string;
  /** Field on the other doc that should declare the same link. */
  missing: string;
  /**
   * True when the other doc has an ambiguous reference in that field, so the
   * link may be declared there under a name the indexer could not pin down.
   */
  uncertain: boolean;
}

export type ProblemKind =
  | 'no-front-matter'
  | 'bad-yaml'
  | 'missing-name'
  | 'type-vs-folder'
  | 'name-collision';

export interface Problem {
  kind: ProblemKind;
  files: string[];
  detail: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  references: Reference[];
  oneSided: OneSidedLink[];
  problems: Problem[];
}
