# rcd-data-models-viewer

A local viewer for [`rcd-data-models`](https://github.com/kenzowatanabee/rcd-data-models),
the data dictionary and lineage map of the RCD Domo stack.

**Current state: indexer and a first viewer.** The viewer shows the docs, their
front-matter and their direct lineage; there is no lineage graph or search yet.

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

The address is `#/doc/<repo-relative path>`, so back, forward and reload work. When a
Markdown file in the clone changes, the open page and the index refresh by themselves.

The server only reads Markdown files inside the clone (`GET /api/graph`,
`GET /api/doc?file=<repo-relative path>`); other paths, `.git` and anything outside the
clone are refused.

Not built yet: the interactive lineage graph, column and full-text search, a desktop
package, and a production build.

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
