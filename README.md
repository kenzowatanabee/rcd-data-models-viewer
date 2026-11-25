# rcd-data-models-viewer

A local viewer for [`rcd-data-models`](https://github.com/kenzowatanabee/rcd-data-models),
the data dictionary and lineage map of the RCD Domo stack.

**Current state: indexer, viewer and lineage graph.** The viewer shows the docs, their
front-matter and their direct lineage, and draws the whole lineage as an interactive
graph; there is no column or full-text search yet.

The viewer never copies the docs. It reads a clone of `rcd-data-models` from a path you
give it, so it shows whatever branch that clone has checked out.

## Setup

```bash
pnpm install
pnpm check         # prettier, eslint, tsc and the tests, without changing files
```

## Viewer

```bash
pnpm start                       # reads ../rcd-data-models
pnpm start ../rcd-data-models    # or any other path to a clone
```

It starts a local server (Vite, on `http://localhost:5173/` or the next free port) and
stops with Ctrl+C. The path is checked first: if it has no `docs/datasets` and
`docs/pipelines`, the command stops with a message saying so.

What it shows:

- **Sidebar:** datasets (with their `layer`), pipelines, and the other Markdown files
  (`README.md`, `docs/*.md`, `guides/*.md`), with counts. The filter matches names and
  aliases, ignoring case and accents.
- **Doc page:** the Markdown with GitHub-style tables and Mermaid diagrams. The
  front-matter is not shown as text; its kind, layer, platform, status, last update and
  Domo id are shown as a header instead. Raw HTML in the Markdown is dropped, not
  rendered: a `<details>` block shows its content, without the summary line. A diagram that does not parse shows the
  error and its source. Large diagrams are shown at full size and scroll; "Fit to
  width" shrinks them.
- **Links:** links to other Markdown files in the repo open in the viewer, `http(s)`
  links open in a new tab, and links to other files or folders are shown greyed out.
- **Lineage panel** on dataset and pipeline pages: the direct upstream and downstream
  docs from the graph (undocumented names are listed but not clickable), plus the gaps
  that involve the doc: one-sided links and ambiguous, unresolved or wrong-kind
  references.
- **Landing page:** the indexer summary (counts, problems) and the repo `README.md`.
- **Lineage graph** (`#/graph`, linked from the top of the sidebar): see below.

The address is `#/doc/<repo-relative path>`, so back, forward and reload work. When a
Markdown file in the clone changes, the open page and the index refresh by themselves.

The server only reads Markdown files inside the clone (`GET /api/graph`,
`GET /api/doc?file=<repo-relative path>`); other paths, `.git` and anything outside the
clone are refused.

### Lineage graph

The graph page lays out every dataset, pipeline and undocumented name from left to
right, in the direction the data flows, so sources end up on the left and outputs on
the right. Drag to pan, scroll to zoom; the buttons at the top left zoom and fit the
graph to the window, and the minimap at the bottom right (on wide windows) pans too.

- **Nodes:** datasets are rectangles with a coloured bar for their `layer` (source,
  dimension, intermediate, output; grey for anything else) and the layer written
  underneath. Pipelines are rounded and purple. Names no doc has are dashed and grey,
  marked "undocumented". Nodes with no edges at all are shown in a row under the
  graph, headed "Not linked to anything". The legend is in the side panel.
- **Direct links:** a dataset → dataset link from `upstream` is hidden by default when a
  pipeline between the same two datasets already declares the flow (the dataset is an
  input of the pipeline and the other is its output). Links with no such pipeline are
  always shown, since they are the only record of that flow. "Direct links a pipeline
  also gives" shows the hidden ones as dashed lines.
- **Undocumented names:** the "Undocumented names" box hides or shows the `external`
  nodes and their edges.
- **Selecting:** clicking a node lights up everything it is built from (blue) and
  everything built from it (orange), and dims the rest; clicking empty space clears it.
  The side panel shows the node's kind, layer and status, how many datasets, pipelines
  and undocumented names lie upstream and downstream, the ones furthest back (nothing
  feeds them) and the ones it ends up in (nothing reads them), a count of lineage gaps,
  and "Open doc" for documented nodes. Shift-clicking a second node shows only what
  lies between the two, and lists the pipelines on the way.
- **Only this lineage:** lays out the selected node with only what is upstream and
  downstream of it. "Whole graph" goes back. Depth 1 or 2 limits both the highlight and
  this view to that many datasets away, with the pipelines between them; "all" has no
  limit. "Show in graph" on a doc's lineage panel opens this view for that doc.
- **Find:** the search box matches names and aliases the way the sidebar filter does
  (ignoring case and accents), selects the node and centres the view on it, switching
  to the whole graph, and showing undocumented names, if it is not in the current view.

The address holds the view: `#/graph` for the whole graph, `#/graph?node=<id>` with a
selection, `#/graph/<id>` for one node's lineage, plus `depth=1|2`, `external=hide` and
`links=all` when they differ from the defaults. Node ids are doc paths or
`external:<name>`, URL-encoded. Changing the view adds a history entry, so back and
forward step through views; selecting a node replaces the current entry. When the
docs change, the graph refreshes and keeps the selection while the node still exists;
the layout is only recomputed when the drawn nodes or edges change.

The whole graph is an overview: at around 90 nodes, fitted to a laptop screen, the
labels are too small to read without zooming, and the dimension datasets that feed
most pipelines draw long bundles of edges across the middle. Selecting a node, or
"Only this lineage", is the readable way to follow one flow.

Not built yet: column and full-text search, a desktop package, and a production build.

## Indexer

```bash
pnpm run index ../rcd-data-models               # writes graph.json and prints a summary
pnpm run index ../rcd-data-models --out g.json
```

It reads the YAML front-matter of every file in `docs/datasets/` and `docs/pipelines/` and
links the docs by the names they give each other:

| Field        | On       | Points at                     | Edge               |
| :----------- | :------- | :---------------------------- | :----------------- |
| `pipeline`   | dataset  | the pipeline that produces it | pipeline → dataset |
| `upstream`   | dataset  | datasets it is built from     | dataset → dataset  |
| `downstream` | dataset  | pipelines that read it        | dataset → pipeline |
| `inputs`     | pipeline | datasets it reads             | dataset → pipeline |
| `outputs`    | pipeline | datasets it writes            | pipeline → dataset |

A name is looked up as an exact `name`, then as an exact alias, then ignoring case, accents
and separators. Each reference records which of these matched.

Nothing is guessed:

- A name that **two docs of the same kind share** is `ambiguous`: no edge is drawn and both
  candidates are listed. The fix is in the docs: give each a unique `name` and keep the
  shared Domo name as an alias, since an exact `name` wins over an alias.
- A name **no doc has** is `unresolved` and becomes an `external` node, so undocumented
  sources stay visible in the graph.
- A dataset ↔ pipeline link that **only one of the two docs declares** is listed under
  `oneSided`. It is marked `uncertain` when the other doc has an ambiguous reference in that
  field, because the link may be there under the shared name.
- Docs without front-matter, with invalid YAML, without a `name`, or whose `type` disagrees
  with their folder are listed under `problems`.

`graph.json` holds `nodes`, `edges`, `references`, `oneSided` and `problems`; the types are
in [`src/indexer/types.ts`](src/indexer/types.ts). It is generated, and not committed.
