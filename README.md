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
- **Doc page:** a header with the doc's title (its `# heading`, shown once), the kind,
  layer and status as badges (`draft` is dashed amber, `reviewed` solid green), the
  dataset's `grain` on its own line, the platform, Domo id, last update, aliases, the
  file path with a copy button, and "Show in graph" for datasets and pipelines. Docs
  without front-matter get the title and path only. The body is set for reading: prose
  keeps to about 78 characters a line while tables, code and diagrams use the full
  width. Hovering a heading shows a link icon that puts the section in the address and
  copies it.
- **On this page:** the doc's `##` and `###` headings, highlighting the section being
  read; a click scrolls there (without animation when the system asks for reduced
  motion, and instantly for long jumps). On wide windows (1200 px and up) it sits in the
  right-hand column under the lineage, each part scrolling on its own; on narrower ones
  it is a drop-down in a bar that stays at the top of the doc.
- **Tables** scroll inside their own frame, with the header row kept in view and a
  shadow on an edge where columns are cut off. Columns holding only numbers are
  right-aligned. Tables with more than 12 rows get a filter box that hides rows not
  matching (the same matching as the sidebar filter) and shows "n of m rows".
- **Code blocks** have a copy button; `sql` blocks are coloured by a small built-in
  tokenizer. **Diagrams** (` ```mermaid ` blocks) sit in a frame with a toolbar and
  "Open larger": a full-window view where dragging or the arrow keys pan, the wheel or
  - and − zoom, 0 fits, and Esc closes. Flowcharts are drawn by the viewer itself; other
    diagrams by the Mermaid library (see [Diagrams](#diagrams) below). A diagram that does
    not parse shows the error and its source.
- **Raw HTML:** only an allowlist is rendered: `details` (with `open`), `summary`, `br`,
  `i`, `b`, `sub`, `sup`, `kbd`, and `a` with an `id` and nothing else (link targets
  such as `<a id="dn"></a>` in the glossary; the id gets a `user-content-` prefix and
  `#dn` still finds it). A raw HTML fragment with any other tag or attribute is shown as
  plain text, so placeholders like `<export date>` stay visible, and the result is
  sanitised again before rendering, so scripts, styles, frames, event handlers and
  `javascript:` links cannot get through. `<details>` blocks (column lists, the
  generated tile lists) stay collapsed until opened.
- **Long docs:** a "Top" button appears after scrolling; back and forward return to
  where each page was; `#/doc/<file>#<heading>` lands on the heading, opening any
  `<details>` around it. A live refresh after an edit keeps the scroll position, open
  `<details>` and table filters.
- **Links:** links to other Markdown files in the repo open in the viewer, `http(s)`
  links open in a new tab, and links to other files or folders are shown greyed out.
- **Lineage panel** on the right of dataset and pipeline pages (above the doc on
  narrow windows): the direct upstream and downstream docs from the graph with counts,
  each with its layer marker as in the sidebar (undocumented names have a dashed hollow
  marker and are not clickable), and the gaps that involve the doc: one-sided links and
  ambiguous, unresolved or wrong-kind references, each explained with the front-matter
  field and the file to fix.
- **Landing page:** the indexer summary (counts, problems) and the repo `README.md`.
- **Lineage graph** (`#/graph`, in the top bar): see below. There, `/` focuses the
  find box.

The address is `#/doc/<repo-relative path>`, so back, forward and reload work. When a
Markdown file in the clone changes, the open page and the index refresh by themselves.

The server only reads Markdown files inside the clone (`GET /api/graph`,
`GET /api/doc?file=<repo-relative path>`); other paths, `.git` and anything outside the
clone are refused.

### Diagrams

`flowchart` and `graph` diagrams are drawn by the viewer's own renderer: a parser for
the flowchart syntax the docs use, a layout with dagre and plain SVG. Everything else
(`erDiagram`, `sequenceDiagram` and any other type) is drawn by the Mermaid library,
which is only loaded on pages that need it.

**Supported syntax:** `flowchart` / `graph` with `TB`, `TD`, `BT`, `LR` or `RL`; node
shapes `[ ]`, `( )`, `([ ])`, `[[ ]]`, `[( )]`, `(( ))`, `((( )))`, `{ }`, `{{ }}`,
`[/ /]`, `[\ \]`, `[/ \]`, `[\ /]` and `> ]`; quoted and unquoted labels with `<br>`,
`<i>`/`<em>`, `<b>`/`<strong>`, HTML entities and Mermaid's `#quot;`-style codes; links
`-->`, `---`, `-.->`, `-.-`, `==>`, `===` of any length, with `x`, `o` and two-ended
(`<-->`) heads, labels as `-->|text|` or `-- text -->`, chains (`A --> B --> C`) and `&`;
subgraphs with an id and title, nesting and `direction`, and links to or from a
subgraph; `classDef`, `class`, `:::`, `style`, `linkStyle` (numbers or `default`);
`%%` comments, `%%{init}%%` directives (ignored) and `;`.

**When Mermaid draws a flowchart instead:** the viewer draws a flowchart only if its
parser reads every line of it and it can draw everything it uses. A line it does not
read (`click`, `@{ }` shapes, `~~~` links, Markdown strings, a `%%` comment after a
statement, an id with a hyphen, and anything else outside the list above), a style
property other than `fill`, `stroke`, `color`, `stroke-width`, `stroke-dasharray`,
`font-weight` and `font-style`, a colour other than hex, `rgb()` or a basic name, or a
link between a subgraph and its own content all hand the diagram to Mermaid. A note in
the toolbar ("Mermaid", with the reason on hover) says so. A flowchart Mermaid cannot
parse either shows Mermaid's error, with the viewer's reason under it.

**Viewer / Mermaid:** a diagram the viewer draws has a switch in its toolbar to see
Mermaid's drawing of it instead; the choice is not remembered.

**Reading a drawing:**

- In the doc it is fitted to the column when that keeps the text at 64% or more;
  otherwise it is shown at 72% and the frame scrolls sideways (drag it, or use a
  trackpad or Shift + wheel). The wheel scrolls the page; Ctrl/⌘ + wheel and the − and +
  buttons zoom; "Fit width" fits the column whatever the size.
- Clicking a node lights up everything upstream (blue) and downstream (orange) of it
  and dims the rest; clicking empty space clears it. A link from a subgraph counts as a
  link from each node in it.
- A node whose first label line is the `name` or an alias of exactly one dataset or
  pipeline doc (ignoring case, accents and separators, as the indexer does) links to
  it: "Open doc" when it is selected, or double-click. A name two docs share links
  nowhere.
- "Open larger" adds a find box: type part of a label, Enter selects the node and
  centres the view on it.

**Layout:** a subgraph that no link crosses (links to the subgraph itself are fine) is
laid out on its own, in its `direction`, and placed as one block; if nothing inside it
is linked, its nodes wrap into rows (or columns, for `LR`), so a list of 19 inputs is a
grid rather than one long row. Other subgraphs are frames around their nodes in the
main layout, and their `direction` is ignored, as Mermaid also does. Labels wider than
about 260 px wrap at spaces.

**Colours:** unstyled nodes, frames and links use the theme's colours. Colours from
`classDef`, `style` and `linkStyle` are kept as written in the light theme. In the dark
theme each is turned around in lightness with its hue kept (in OKLab): pale fills become
dark tints, dark text becomes light, and strokes become light enough to see. Either way,
text is kept at 4.5:1 against its fill and strokes at 3:1 against the page, adjusting
the lightness only when needed.

Drawings are laid out only when they come near the screen (or their `<details>` opens),
and are cached by source, so a live refresh that leaves a diagram unchanged redraws it
at once. The renderer uses SVG elements only: no inline `<style>` and no HTML strings.

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
