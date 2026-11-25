# rcd-data-models-viewer

A local viewer for [`rcd-data-models`](https://github.com/kenzowatanabee/rcd-data-models),
the data dictionary and lineage map of the RCD Domo stack.

**Current state: indexer, viewer, lineage graph and docs health.** The viewer shows the
docs, their front-matter and their direct lineage, draws the whole lineage as an
interactive graph, and lists what to fix in the docs; quick open finds docs, names and
headings, but there is no column or full-text search yet.

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

- **Top bar:** the three sections, Docs, Lineage graph and Docs health ("Docs" returns
  to the last doc open; Docs health shows how many things there are to fix), "Go to…"
  with its shortcut (quick open, see below), the name of the docs folder being viewed
  (the full path on hover), row density (comfortable or compact) and the theme: light,
  dark or the system's. Density and theme are remembered, and diagrams and the graph
  switch with the theme. Below 1100 px the folder name is hidden, and below 960 px the
  section names and "Go to…" become icons (named on hover and to screen readers). The
  bar is marked as the drag area for a future frameless desktop window; this has no
  effect in a browser.
- **Sidebar:** pinned docs and the last 6 opened (each shown only when not empty), then
  the docs in groups that can be folded, each with its count:
  - **Group** chooses how datasets are listed, and is remembered: **Layer** (the
    default: Source, Dimension, Intermediate, Output, then anything else, each a
    subgroup with its colour marker), **A–Z** (one list, with the layer after each
    name) or **Family** (datasets and pipelines in the same bands as the lineage graph:
    shared lookups, shared feeds, each family and "Not linked to anything"; the graph's
    undocumented names are left out). Pipelines are one group; other docs are grouped
    by folder (repository root, `docs/`, `guides/`).
  - **Rows:** most names share `RCD_` or `RCD_TAB_`, so that prefix is shown muted and
    the rest at full contrast. When a name does not fit, the prefix becomes `…` so the
    end of the name, which tells similar names apart, stays visible; the end is cut
    only if it still does not fit. The full name, title, path, layer, status and
    aliases are on hover, and the name, layer, status and issue count in the row's
    accessible name. A dashed amber ring marks `draft`, a green tick `reviewed`. A
    warning count marks docs named in Docs health; it opens that page filtered to the
    doc. Hovering a row shows a pin button.
  - **Filter:** `/` focuses it and Esc clears it (then the chips). It matches names and
    aliases like quick open: any order of words, ignoring case, accents and separators
    (`mkt cust compl` finds `RCD_TAB_MKT_CUSTOMER_COMPLETO`), best match first, matched
    letters underlined. Groups show "matches / total", only groups with matches are
    listed and they open while filtering; the folding you had comes back when the
    filter is cleared. "Filters" shows quick filters: the four layers (any of them),
    `Draft` and `Has issues`, which combine with each other and with the text. With no
    match, "Clear filters" resets everything.
  - **Keyboard:** ↑ and ↓ move through groups and docs, → opens a group (or moves into
    it), ← closes it (or goes from a doc to its group), Home and End go to the ends,
    `p` pins or unpins the focused doc, and typing letters jumps to the next doc whose
    name, or the part after its shared prefix, starts with them (so letter shortcuts
    such as `j` do not fire while a row has focus). Only one row is in the Tab order.
    Group headers stay at the top while their group scrolls, and the open doc is
    scrolled into view only when it is out of sight.
  - The footer has the counts and a link to Docs health with its count. Drag the
    sidebar's edge to resize it (or focus the edge and use the arrow keys;
    double-click resets it), and hide it with `[` or the button at the left of the top
    bar. The width, the hidden state, the folded groups, the pins and the grouping are
    remembered.
- **Doc page:** a bar stays at the top with where the doc is (Docs › Datasets › Output ›
  name, following the grouping), "Rendered | Markdown" (`m`), a pin button and the
  button for the right-hand column. Below it, a header with the doc's title (its
  `# heading`), the kind, layer and status as badges (`draft` is dashed amber,
  `reviewed` solid green), the dataset's `grain` on its own line, the platform, Domo
  id, last update, aliases, the file path with buttons to copy it and to copy a
  Markdown link (`[NAME](docs/datasets/x.md)`), and "Show in graph" for datasets and
  pipelines. Docs without front-matter get the title and path only. The body is set
  for reading: prose keeps to about 78 characters a line while tables, code and
  diagrams use the full width. Hovering a heading shows a link icon that puts the
  section in the address and copies it.
- **Markdown view:** "Markdown" (or `m`) shows the file exactly as on disk,
  front-matter included, in a monospace view with line numbers, front-matter keys,
  headings, code fences, inline code, links and table pipes lightly coloured by a small
  built-in tokenizer, a "Wrap" switch (remembered) and "Copy all". The text is only
  ever shown as text, so HTML in a doc never runs. The address gets `?view=md` (reload,
  back and forward keep it), and a doc left in this view opens in it again in the same
  tab; other docs are not affected. Switching keeps the section being read in view.
  "On this page" still works (it scrolls to the heading's line), a line number links
  to that line (`?view=md&line=42`, highlighted), and a live refresh updates the text
  and keeps the scroll position.
- **Layout and the right-hand column:** from 1200 px wide the doc has three columns:
  sidebar, doc and a right-hand column with the lineage over "On this page". The
  columns give way (the right-hand one first, neither below its minimum) so the doc
  column keeps at least 560 px. The right-hand column can be resized by its left edge
  (arrow keys work too; double-click resets) and folded with `]` or the button in the
  doc's bar; folded, a thin strip at the window edge brings it back. Width and folding
  are remembered. Below 1200 px the column becomes a drawer opened with the same button
  or `]`; below 900 px the sidebar becomes a drawer too, opened from the top bar or with
  `[` (`/` opens it at the filter). Drawers keep focus inside, close with Esc, a click
  outside or by opening a doc, return focus to the button that opened them, and do not
  animate when the system asks for reduced motion.
- **On this page:** the doc's `##` and `###` headings, highlighting the section being
  read; a click scrolls there (without animation when the system asks for reduced
  motion, and instantly for long jumps).
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
- **Lineage panel** in the right-hand column of dataset and pipeline pages: the direct
  upstream and downstream docs from the graph with counts, each with its layer marker
  as in the sidebar (undocumented names have a dashed hollow marker and are not
  clickable), and the gaps that involve the doc: one-sided links and ambiguous,
  unresolved or wrong-kind references, each explained with the front-matter field and
  the file to fix.
- **Landing page:** the counts of datasets, pipelines, other docs, edges and
  references; the pinned and recent docs; the Docs health sections with their counts,
  each linking to its section; then the repo `README.md`. Doc pages, the landing page
  and Docs health share the same page width and padding, and every scrolling area has
  thin scrollbars in the theme's colours.
- **Lineage graph** (`#/graph`, in the top bar): see below. There, `/` focuses the
  find box.

The address is `#/doc/<repo-relative path>`, so back, forward and reload work. When a
Markdown file in the clone changes, the open page and the index refresh by themselves.

The server only reads Markdown files inside the clone (`GET /api/graph`,
`GET /api/doc?file=<repo-relative path>`, `GET /api/headings`); other paths, `.git` and anything outside the
clone are refused.

### Quick open

Ctrl+K (⌘K on macOS), or "Go to…" in the top bar, opens a search box over every dataset,
pipeline and other doc, the undocumented names, the `##` to `####` headings of every
doc, and a few commands (go to a section, switch the theme, show or hide the sidebar,
show the open doc in the graph, open the selected graph node's doc, copy the open doc's
path). Before anything is typed it lists the last 8 items opened (remembered) and the
commands.

Matching ignores case, accents and the difference between spaces, hyphens and
underscores, as the sidebar filter does. The query is split into words and every word
must match, in any order, so `mkt cust compl` finds `RCD_TAB_MKT_CUSTOMER_COMPLETO`.
A whole word or the start of a word ranks above a match inside a word, which ranks above
letters spread over the starts of words (`rsr` for `RCD_SORT_REC`); a match on the
`name` ranks above one on an alias, which ranks above one on the path, title or a
heading; then the name the query covers most, then the shorter name. Matched letters are
underlined, and a match on an alias or path is shown under the name. Results are grouped
by kind, the group with the best match first.

↑ and ↓ (Home and End with an empty box, or with Ctrl/⌘) move, Enter opens the doc (or
the graph, for an undocumented name; a heading opens at that heading), Ctrl/⌘+Enter
opens the item in the lineage graph instead, and Esc or a click outside closes it and
returns focus to where it was. The heading index is built by the server once and rebuilt
after a doc changes; searching makes no request per keystroke.

### Keyboard shortcuts

`?` lists them all. They do nothing while typing in a text field (except Ctrl/⌘+K), while
a dialog is open, or during input-method composition, and none uses a browser shortcut.

| Keys                      | Where            | Does                                                                                |
| :------------------------ | :--------------- | :---------------------------------------------------------------------------------- |
| Ctrl/⌘+K                  | everywhere       | quick open                                                                          |
| `?`                       | everywhere       | the list of shortcuts                                                               |
| `/`                       | everywhere       | focus the sidebar filter (the find box on the graph, the filter on the health page) |
| `g` `d`, `g` `g`, `g` `h` | everywhere       | go to Docs, the lineage graph, Docs health                                          |
| `[`                       | doc pages        | show or hide the sidebar                                                            |
| `]`                       | doc pages, graph | show or hide the right-hand column or side panel                                    |
| `j` / `k`, Alt+↓ / Alt+↑  | doc pages        | next / previous doc in the sidebar's order                                          |
| `t`                       | doc pages        | back to the top                                                                     |
| `m`                       | doc pages        | switch between the rendered page and its Markdown                                   |
| `f`, `0`                  | graph            | fit to the window, actual size                                                      |

Two-key sequences must be typed within about a second. On a doc page, `]` folds the
right-hand column away (remembered), or opens it as a drawer on narrower windows.

### Docs health

`#/health` lists everything the indexer found that needs fixing, as a to-do list. A row
of counts at the top links to each section:

- **Docs the indexer could not read:** no front-matter, invalid YAML, no `name`, a `type`
  that disagrees with the folder, or a `name` two docs share, with what to change.
- **Ambiguous references:** a name two docs share, the docs that have it and every field
  that writes it.
- **Wrong-kind references:** a field naming a doc of the other kind.
- **Undocumented names:** each unresolved name once, every doc and field that mentions it,
  and how many nodes lie downstream of it, most first.
- **One-sided links:** the doc and field that declare the link, and the field to add on
  the other doc; marked uncertain when it may be there under an ambiguous name.
- **Datasets linked to nothing.**
- **Direct links with no pipeline:** a dataset's `upstream` naming another dataset with no
  pipeline between them, which suggests an undocumented pipeline.
- **Status and staleness:** `draft` / `reviewed` counts by kind, and the 10 docs with the
  oldest `last_updated`.

Each section explains what it means and what to change, links every item to its doc (and
to the graph), folds away (sections with nothing to do start folded and say "All good"),
and has "Copy as checklist", which copies it as a Markdown to-do list. The filter box
searches every section; `#/health?q=<text>` opens the page with it filled in, which is
where a doc's warning count in the sidebar leads. The page updates when a doc is saved.

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
the right. Drag to pan, scroll to zoom. The controls at the bottom left zoom out and
in, show the zoom level, fit everything shown to the window ("Fit") and go to actual
size ("100%"); fitting keeps them and the minimap clear of the graph. The minimap at
the bottom right pans and zooms too; it is hidden when the canvas is narrower than
900px. Zoomed out below 55%, where labels would be too small to read, nodes are drawn
as blocks in their layer's colour and the band titles are drawn larger over them, so
the overview reads as named blocks; hovering a node shows its full name, kind, layer
and file at any zoom.

**Toolbar:** one row, from 1000px wide up: find, "Whole graph | Only this lineage",
depth (only while a node is selected or a lineage is shown), the node and link counts
(hidden below 1200px; the side panel repeats them), "View options" and the side panel
switch. "View options" opens a menu of the display options, each with a line saying
what it does; a badge on the button counts those changed from the defaults, and the
menu can reset them. It opens with Enter or a click, and Esc closes it and returns
focus to the button.

The whole graph is drawn as framed blocks rather than one network:

- **Shared lookups:** a `dimension` dataset read by 3 or more pipelines is a shared
  lookup (on the current docs: `DE PARA RD`, `PRODUCT_DIMENSION`, `RCD_PARA_RETIRAR`,
  `RCD_SORT_REC_NACIONAL` and `STORE_DIMENSION`). Its links are not drawn and do not
  affect the layout. Each node that reads lookups carries a tag such as "3 lookups";
  hovering it lists them, clicking it opens the list, and a name in the list selects
  that lookup. The lookups themselves sit in their own "Shared lookups" frame.
  "Lines for shared lookups" in View options draws their links as curves instead; the
  layout stays the same.
- **Shared feeds:** any other dataset or undocumented name read by 4 or more pipelines
  (`Retailer POS datasets`, `RCD_SCANTECH`, `RCD_ATACADÃO`). Its links are drawn, but
  they do not join the families it feeds: a feed stays in a frame of its own with
  whatever produces it, titled "Shared feed: …", in a column on the left, and its
  links run as curves to the right into the frames it feeds. Those 17 curves cross
  other frames, so they are drawn thin and faint until the feed or one of its readers
  is hovered, or a frame at either end is hovered in the side panel; selecting the
  feed, a reader, or anything whose lineage runs through them draws them in the
  trace colours like any other link. A reader's hover text names the feed it reads,
  and its side panel lists it under "Shared feeds it reads".
- **Families:** what is left is split into families, the groups of nodes linked to
  each other (ignoring direction). Each family is laid out on its own, in a frame
  titled after what it produces. With one final dataset (one nothing in the family
  reads), the frame is named after it. With several, it is named after the pipeline
  every one of them comes from (on the current docs `RCD_MASTER_FLOW_1`,
  `RCD_SOA_NIQ_FLOW` and `nielsen_scan_track_query`); failing that, after the `_`
  prefix more than half of them share (`RCD_TAB_*`); failing that, after the final
  dataset built from the most of the family. A quieter second part says how many
  outputs it has ("3 outputs", or "+ N more outputs"). A family with no final dataset
  is named after the dataset that feeds most of it. Hovering a frame's title lists its
  members.
  Large families take a row each, largest first; small ones share rows. Nodes linked
  to nothing are in the last frame, "Not linked to anything".

**Side panel:** an inspector on the right. Drag its left edge (or focus it and use
the arrow keys) to resize it; the button at the end of the toolbar hides and shows
it. Both are remembered. When it changes size the canvas refits if it was showing the
whole fitted graph, and otherwise keeps what was in the middle in the middle.

- **Nothing selected:** the counts, how to use the graph, the bands with their node
  counts (click or Enter zooms to one; hovering or focusing one outlines it on the
  canvas and draws the feed curves into or out of it; arrow keys move along the
  list), and the legend, folded away.
- **A node selected:** its name; kind, layer and status badges as on its doc page;
  "Open doc", "Only this lineage" (or "Whole graph") and "Clear"; then everything
  upstream and downstream of it, grouped into pipelines, datasets and undocumented
  names, nearest first, with layer markers as in the sidebar. Rows marked "start" have
  nothing feeding them, "end" nothing reading them. Long lists scroll on their own
  with a shadow at the edge that has more. Clicking a row selects that node and
  centres it. Then the shared feeds and lookups it reads, and its lineage gaps in
  plain words, with a link to the doc page that explains how to fix them.
- **Two nodes selected** (shift-click): "Between two nodes", the two ends, "Swap" and
  "Clear second", and the path in the order the data flows, or a note that neither
  feeds the other.

- **Nodes:** datasets are rectangles with a coloured bar for their `layer` (source,
  dimension, intermediate, output; grey for anything else) and the layer written
  underneath. Pipelines are rounded and purple. Names no doc has are dashed and grey,
  marked "undocumented". The legend is in the side panel.
- **Direct links:** a dataset → dataset link from `upstream` is hidden by default when a
  pipeline between the same two datasets already declares the flow (the dataset is an
  input of the pipeline and the other is its output). Links with no such pipeline are
  always shown, since they are the only record of that flow. "Repeated direct links"
  in View options shows the hidden ones as dashed lines.
- **Undocumented names:** "Undocumented names" in View options hides or shows the
  `external` nodes and their edges; while they are hidden the side panel says how many
  and offers to show them.
- **Keyboard:** Tab reaches the toolbar, then one node of the graph, then the zoom
  controls, then the side panel. On a node, Enter selects it (Shift+Enter shows what
  lies between it and the selection), the left and right arrows move along its links
  upstream and downstream, and up and down move to the nearest node above or below.
- **Selecting:** clicking a node lights up everything it is built from (blue) and
  everything built from it (orange), and dims the rest; clicking empty space clears it.
  The side panel shows what it is and what lies upstream and downstream of it (see
  Side panel above). Shared lookups
  count as upstream like any other dataset: their tags light up on the traced nodes,
  and selecting a lookup draws its links. Shift-clicking a second node shows only what
  lies between the two. Esc clears the second node, then the selection. A selection
  made from the address or a lookup tag is centred only when it is off screen; opening
  an address with a selection in the whole graph centres it at 100%.
- **Only this lineage:** lays out the selected node with only what is upstream and
  downstream of it. "Whole graph" goes back. Depth 1 or 2 limits both the highlight and
  this view to that many datasets away, with the pipelines between them; "all" has no
  limit. "Show in graph" on a doc's lineage panel opens this view for that doc. The
  lineage is laid out as one family, with the shared lookups it uses in a frame
  above it.
- **Find:** the search box matches names and aliases the way the sidebar filter does,
  selects the node and centres the view on it, switching
  to the whole graph, and showing undocumented names, if it is not in the current view.
  With no match it says so; Esc closes the list, a second Esc clears the box.
- **Edge cases:** an address naming a node the graph does not have (renamed or
  removed), an undocumented name while those are hidden, or a node outside the
  current lineage shows a note over the canvas with the way out (clear the selection,
  show undocumented names, or show the whole graph). A lineage with no links says so
  and offers the whole graph.

The address holds the view: `#/graph` for the whole graph, `#/graph?node=<id>` with a
selection, `#/graph/<id>` for one node's lineage, plus `depth=1|2`, `external=hide` and
`links=all` and `lookups=wires` when they differ from the defaults. Node ids are doc paths or
`external:<name>`, URL-encoded. Changing the view adds a history entry, so back and
forward step through views; selecting a node replaces the current entry. When the
docs change, the graph refreshes and keeps the selection while the node still exists;
the layout is only recomputed when the drawn nodes or edges change.

The whole graph is an overview: at around 90 nodes, fitted to a laptop screen, it is
drawn as named blocks; zooming to one frame from the side panel makes the labels
readable. Selecting a node, or "Only this lineage", is the readable way to follow one
flow.

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
