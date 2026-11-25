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

- **Top bar:** the two sections, Docs and Lineage graph ("Docs" returns to the last doc
  open), the name of the docs folder being viewed (the full path on hover), and the
  theme: light, dark or the system's. The theme is remembered, and diagrams and the
  graph switch with it.
- **Sidebar:** datasets (with their `layer`, as a coloured marker and its name),
  pipelines, and the other Markdown files (`README.md`, `docs/*.md`, `guides/*.md`),
  in groups with counts that can be collapsed. `/` focuses the filter, Esc clears it,
  and the arrow keys move through the list. Drag the sidebar's edge to resize it
  (or focus the edge and use the arrow keys; double-click resets it), and hide it with
  the button at the left of the top bar. The width, the hidden state and the collapsed
  groups are remembered. The filter matches names and
  aliases, ignoring case, accents and the difference between spaces, hyphens and
  underscores (`hierarquia soa` finds `RCD_HIERARQUIA_SOA`).
- **Doc page:** the Markdown with GitHub-style tables and Mermaid diagrams. The
  front-matter is not shown as text; its kind, layer, platform, status, last update and
  Domo id are shown as a header instead. Raw HTML in the Markdown is dropped, not
  rendered: a `<details>` block shows its content, without the summary line. A diagram that does not parse shows the
  error and its source. Large diagrams are shown at full size and scroll; "Fit to
  width" shrinks them.
- **Links:** links to other Markdown files in the repo open in the viewer, `http(s)`
  links open in a new tab, and links to other files or folders are shown greyed out.
- **Lineage panel** on the right of dataset and pipeline pages (above the doc on
  narrow windows): the direct upstream and downstream
  docs from the graph (undocumented names are listed but not clickable), plus the gaps
  that involve the doc: one-sided links and ambiguous, unresolved or wrong-kind
  references.
- **Landing page:** the indexer summary (counts, problems) and the repo `README.md`.
- **Lineage graph** (`#/graph`, in the top bar): see below. There, `/` focuses the
  find box.

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

The whole graph is drawn as framed blocks rather than one network:

- **Shared lookups:** a `dimension` dataset read by 3 or more pipelines is a shared
  lookup (on the current docs: `DE PARA RD`, `PRODUCT_DIMENSION`, `RCD_PARA_RETIRAR`,
  `RCD_SORT_REC_NACIONAL` and `STORE_DIMENSION`). Its links are not drawn and do not
  affect the layout. Each node that reads lookups carries a tag such as "3 lookups";
  hovering it lists them, clicking it opens the list, and a name in the list selects
  that lookup. The lookups themselves sit in their own "Shared lookups" frame.
  "Wires for shared lookups" draws their links as curves instead; the layout stays the
  same.
- **Shared feeds:** any other dataset or undocumented name read by 4 or more pipelines
  (`Retailer POS datasets`, `RCD_SCANTECH`, `RCD_ATACADÃO`). Its links are drawn, but
  they do not join the families it feeds: a feed stays in a frame of its own with
  whatever produces it, titled "Shared feed: …", in a column on the left, and its
  links run as curves to the right into the frames it feeds.
- **Families:** what is left is split into families, the groups of nodes linked to
  each other (ignoring direction). Each family is laid out on its own, in a frame
  titled after its main output: the final dataset (one nothing in the family reads)
  built from the most of the family, with "+ N more" when it has other final datasets.
  A family with no final dataset is named after the dataset that feeds most of it.
  Large families take a row each, largest first; small ones share rows. Nodes linked
  to nothing are in the last frame, "Not linked to anything".

With nothing selected, the side panel lists the frames with their node counts;
clicking one zooms to it.

- **Nodes:** datasets are rectangles with a coloured bar for their `layer` (source,
  dimension, intermediate, output; grey for anything else) and the layer written
  underneath. Pipelines are rounded and purple. Names no doc has are dashed and grey,
  marked "undocumented". The legend is in the side panel.
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
  feeds them) and the ones it ends up in (nothing reads them), the shared lookups it
  reads, a count of lineage gaps, and "Open doc" for documented nodes. Shared lookups
  count as upstream like any other dataset: their tags light up on the traced nodes,
  and selecting a lookup draws its links. Shift-clicking a second node shows only what
  lies between the two, and lists the pipelines on the way.
- **Only this lineage:** lays out the selected node with only what is upstream and
  downstream of it. "Whole graph" goes back. Depth 1 or 2 limits both the highlight and
  this view to that many datasets away, with the pipelines between them; "all" has no
  limit. "Show in graph" on a doc's lineage panel opens this view for that doc. The
  lineage is laid out as one family, with the shared lookups it uses in a frame
  above it.
- **Find:** the search box matches names and aliases the way the sidebar filter does,
  selects the node and centres the view on it, switching
  to the whole graph, and showing undocumented names, if it is not in the current view.

The address holds the view: `#/graph` for the whole graph, `#/graph?node=<id>` with a
selection, `#/graph/<id>` for one node's lineage, plus `depth=1|2`, `external=hide` and
`links=all` and `lookups=wires` when they differ from the defaults. Node ids are doc paths or
`external:<name>`, URL-encoded. Changing the view adds a history entry, so back and
forward step through views; selecting a node replaces the current entry. When the
docs change, the graph refreshes and keeps the selection while the node still exists;
the layout is only recomputed when the drawn nodes or edges change.

The whole graph is an overview: at around 90 nodes, fitted to a laptop screen, the
labels are too small to read without zooming; zooming to one frame from the side panel
makes them readable. The links from the shared feeds cross other frames on their way
to the ones they feed. Selecting a node, or
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
