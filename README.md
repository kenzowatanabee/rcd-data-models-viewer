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

The server only answers requests addressed to itself (`localhost`, `127.0.0.1` or
`[::1]` with its port); a request with any other `Host` header gets a 403, so a web page
cannot reach it by pointing its own domain name at your machine.

### Desktop app

The same viewer in its own window (Electron), run from this repo. There is no installer
yet.

```bash
pnpm app                         # the folder used last time, or a welcome screen
pnpm app -- ../rcd-data-models   # open this folder (and remember it)
```

`pnpm app` bundles the app's main process into `out/` (git-ignored) and starts it. The
first time, the window asks for the docs folder: "Choose folder…" opens the system
folder picker, and a folder without `docs/datasets` and `docs/pipelines` is refused with
the reason. A path on the command line always wins over the remembered one; if the app is
already running, the running window opens it instead of a second window starting.

To switch folders: **File → Open Folder…** (⌘O / Ctrl+O), **File → Open Recent** (the last
five), the folder control at the bottom of the sidebar (recent folders, Open another
folder…, Clone…, "Reveal in Finder" / "Show in File Explorer", Copy path) or
**Settings → General**. The viewer reloads for the new folder and restores that folder's
own tabs. Window size, position and maximised state are remembered too.

The app's settings are one JSON file, `settings.json`, in:

| OS      | Folder                                           |
| ------- | ------------------------------------------------ |
| macOS   | `~/Library/Application Support/RCD Data Models/` |
| Windows | `%APPDATA%\RCD Data Models\`                     |
| Linux   | `~/.config/RCD Data Models/`                     |

Deleting it resets the app; a damaged file is ignored. `--user-data-dir=<folder>` after
`pnpm app --` uses another folder (for a second profile or tests).

How it is kept safe:

- The window's page is sandboxed with context isolation and no Node.js: it reaches the
  app only through a small preload API (choose, open, reveal and copy the folder; the
  git status, fetch, pull, clone and branch switch described below), and
  the main process checks every call's arguments and that it comes from the app's own
  page.
- The local server listens on `127.0.0.1` only, on a port picked once and then reused (so
  the theme and other settings saved by the page are kept), and checks the `Host`
  header as above.
- The page cannot navigate away from the app or open windows. `http`/`https` links open
  in your default browser; every other kind of link is refused. Permission requests
  (camera, location, notifications...) are denied; only writing to the clipboard, for the
  copy buttons, is allowed.
- A Content-Security-Policy allows the page's own scripts and its two inline scripts by
  hash, and nothing from the network. Styles allow inline (Vite injects CSS that way and
  Mermaid's SVG carries its own styles).

Not built yet: an installer or packaged app, auto-update and signing.

#### Git: status, fetch, pull, clone and switch branch

The desktop app (not `pnpm start` in a browser) can keep the docs clone up to date,
make a new clone and switch branches. It runs the git installed on your computer; it
does exactly these things and nothing else:

- **Status**, on the folder control at the bottom of the sidebar (on the rail when the
  sidebar is hidden): the branch, `↓ n` when the
  upstream has commits you do not have, `↑ n` when you have commits it does not, and a
  dot when there are uncommitted local changes. "Not a git repository", "no upstream",
  "Git not installed" and an operation in progress (merge, rebase...) are shown there
  too. Click it for the details: branch → upstream, the counts, local changes (counts
  only), when the repo was last fetched, the remote (any user name or token removed),
  and the work tree when the docs folder is a subfolder of it.
- **Fetch** (popover button, **Repository → Fetch**, ⌘⇧F / Ctrl+Shift+F):
  `git fetch --prune` from the branch's remote (`origin` when it has none).
- **Pull** (popover, **Repository → Pull**, ⌘⇧P / Ctrl+Shift+P): a fetch, then a
  fast-forward only (`git merge --ff-only @{upstream}`). It is enabled only when that
  would fast-forward; otherwise the popover says why. Uncommitted edits to files the
  pull does not touch are kept. After a pull the open page, the index and the graph
  reload by themselves, and the popover says how many commits and files came in.
- **Clone** ("Clone from GitHub…" on the welcome screen, "Clone Repository…" in the
  folder menu, **File** and **Repository**): a `https://github.com/owner/repo` or
  `git@github.com:owner/repo` URL, checked as you type, cloned into a new folder named
  after the repository inside a folder you choose. An existing folder is never used.
  Progress is shown and the clone can be canceled (the half-made folder is removed).
  The cloned folder then opens.
- **Switch branch** (click the branch in the folder popover, "Switch branch…" in quick
  open, **Repository → Switch Branch…**, ⌘⇧B / Ctrl+Shift+B): see below.

What it never does: commit, push, merge (other than the fast-forward), rebase, reset,
stash, create, delete or rename branches (other than the tracking branch below),
detach HEAD, clean, change git config, or run hooks. Use your
usual git tool (terminal, GitHub Desktop, your editor) for all of that; the app's
messages say so when a pull is refused. Only `github.com` can be cloned from.

**Switch branch.** The branch picker lists the local branches (the current one marked
and first, each with its upstream's `↓ behind` / `↑ ahead` counts, how long ago its last
commit was and that commit's subject) under "Local", and under "On origin" the branches
of the current remote that no local branch tracks. Remote branches are as of the
**last fetch**: the picker says when that was, and its Fetch button fetches and
refreshes the list. Type to filter (every word must appear in the name), ↑/↓ to move,
Enter or a click to switch, Esc to close. Up to 200 branches are listed, most recent
first; the picker says when there are more. Quick open also lists the branches as
results ("Switch to branch").

- Picking a local branch runs `git switch --no-guess --no-recurse-submodules <branch>`.
- Picking a branch that is only on the remote creates the local branch tracking it, in
  one step: `git switch --no-guess --no-recurse-submodules --track --create <branch>
refs/remotes/<remote>/<branch>`. If a local branch of that name already exists, that
  one is checked out instead, and the result says it may be behind the remote's.
- Uncommitted edits to files the two branches have in common carry over, as git does;
  the result says how many local changes were kept. Nothing is ever discarded: git is
  never run with `--force`, `--discard-changes`, `--merge`, `--detach` or `--orphan`.
- After a switch, the result names the previous and the new branch and how many files
  differ between them, and the index, the sidebar, the graph, Docs health and the open
  doc reload by themselves. Tabs stay as they are: a tab on a doc the new branch does
  not have says "This doc is gone", and shows the doc again after switching back.
- Submodules are not updated, and hooks (such as `post-checkout`) do not run.

A switch is refused, with nothing changed, when: another git operation is running; a
merge, rebase, cherry-pick, revert or bisect is in progress; another git program holds
the index lock; the branch is already checked out; the branch no longer exists (the
page only sends the branch's name and kind; the app looks it up in a list it reads
again just before switching, so only a branch under `refs/heads/` or the current
remote's `refs/remotes/<remote>/` can be picked, never a tag, another remote's branch or
anything spelled like an option); the name is one git would not accept or starts with
`-`; uncommitted changes or untracked files would be overwritten (the files are named:
"commit or stash your changes to docs/datasets/a.md, then try again"); and on a
detached HEAD whose commit no branch contains, until you confirm that it will then be
reachable only through git's reflog. The usual refusals (git missing, not a
repository, the repository's own config can start a program) apply too.

**Sign-in.** The app never asks for, stores or shows a password or token: git uses
your own credential helper (Git Credential Manager on Windows, the macOS keychain, or
your SSH key). If GitHub has never been signed in to on this computer, do it once
with your usual git tool (for example run `git fetch` in the clone from a terminal),
then use the app. A Fetch, Pull or Clone you start may open the credential manager's
own sign-in window; the automatic check never does. Git never waits for typed input
(`GIT_TERMINAL_PROMPT=0`, no terminal), and every command has a time limit.

**Automatic check.** While the window is focused, the app fetches in the background
at most every 10 minutes (choose 5, 10, 30, 60 minutes or never in the popover; saved
as `autoFetchMinutes` in `settings.json`). It never runs while another git operation
is running and never shows a pop-up: a failure is one quiet line in the popover. The
status is also refreshed when the window gains focus and after docs change on disk.

**Safety rules.** Only a fixed list of git commands with fixed arguments exists; the
page can pick one but never pass arguments, and works only on the open docs folder.
Clone URLs with another host, scheme (`file://`, `ext::`), a local path, a leading
`-` or a user name or token are refused before git runs, and `--` separates options
from the URL and folder. One git operation runs at a time. Every command runs with
`LC_ALL=C` and these settings, which win over the repository's own `.git/config`
(a repository's config can otherwise make even `git status` start a program):
`core.fsmonitor=false`, `core.hooksPath` set to an empty folder (no hooks),
`core.askPass=` (no prompt program), `protocol.ext.allow=never`,
`submodule.recurse=false`. If the repository's own config sets something that would
start a program and cannot be overridden that way (`core.sshCommand`,
`core.gitProxy`, a `credential` helper, `remote.*.uploadpack`, a non-LFS `filter`),
the app refuses to run git there and says which setting. Git's own "dubious
ownership" (`safe.directory`) refusal is reported, never bypassed. Messages are
scrubbed of anything that looks like a credential before they are shown or logged.

Troubleshooting:

| Message                                       | What to do                                                                                                |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Git not installed                             | macOS: `xcode-select --install` or `brew install git`; Windows: install Git for Windows. Restart the app. |
| GitHub did not accept your sign-in            | Fetch once from a terminal or GitHub Desktop so the credential manager remembers you.                     |
| Couldn't reach GitHub                         | Check the connection; the automatic check tries again later.                                              |
| Would overwrite your uncommitted changes      | Commit, stash or undo the listed files with your usual tool, then Pull.                                   |
| Diverged / your branch has commits to push    | Push, or merge/rebase with your usual tool. The app only fast-forwards.                                   |
| Detached HEAD / no upstream                   | Check out a branch that tracks one (`git switch main`).                                                   |
| A merge/rebase is in progress                 | Finish or abort it with your usual tool.                                                                  |
| Switching would overwrite local work          | Commit or stash the listed files (move untracked ones away), then switch again.                           |
| No branch contains the commit you are on      | Create a branch for it with your usual tool, or confirm to switch anyway (it stays in the reflog).        |
| Another git program is working (lock file)    | Wait for it. If none is running, a crashed one left `.git/index.lock`: check before removing it.          |
| Not trusted / dubious ownership               | Run the `git config --global --add safe.directory …` command git suggests, if the folder is yours.        |
| Repository's own settings can start a program | Inspect `.git/config` in a terminal.                                                                      |

What it shows:

- **Rail:** a narrow column on the far left, always shown: Docs, Lineage graph and Docs
  health (with how many things there are to fix), then quick open, the docs folder (when
  the sidebar is hidden), the keyboard shortcuts and Settings. Each is named on hover with
  its shortcut. Lineage graph and Docs health show the most recently used tab of that
  kind, or open one; Docs does the same for docs, and toggles the sidebar when a doc is
  already shown.
- **Top bar:** show or hide the sidebar, back and forward for the active tab, the tabs, and
  "Go to…" (quick open). It is marked as the drag area for a future frameless desktop
  window; this has no effect in a browser.
- **Tabs:** each tab holds one view: a doc (with its Rendered or Markdown view, section
  and scroll position), the lineage graph (selection, focus, options and viewport), Docs
  health (with its filter) or Home.
  - A click on a doc in the sidebar, a link, a quick open result or a lineage item opens
    it in the active tab. Ctrl/⌘-click or the middle button opens it in a new tab in the
    background, Shift-click in a new tab shown at once; the sidebar's right-click menu
    has "Open in new tab". New tabs open right of the active one, in the order opened.
    Docs open in a tab have a small dot in the sidebar and "Open in a tab" in quick open.
  - Each tab has its own back and forward history (the arrows in the top bar, Alt+← /
    Alt+→, the mouse's back and forward buttons). The browser's own history is not
    used: the address always shows the active tab, switching tabs replaces it, and
    typing or pasting an address opens it in the active tab, so a copied address and a
    reload both work. The browser's back button leaves the viewer.
  - Tabs are dragged to reorder; the middle button or the × closes one; closing the
    active tab shows its right-hand neighbour (else the left one); closing the last tab
    leaves a Home tab. The right-click menu (or the context-menu key, or Shift+F10) has
    Close, Close others, Close to the right, Pin tab, Copy path and Reveal in sidebar.
    Pinned tabs are icons at the left and are kept by "Close others" and "Close to the
    right". The last 20 closed tabs can be reopened. On the strip, ← and → move between
    tabs, Enter shows one and Delete closes it. When the tabs do not fit, the strip
    scrolls (the wheel scrolls it sideways), its edges fade and a ⌄ button lists all
    tabs.
  - The six most recently used tabs stay loaded while hidden, so going back to one
    keeps everything as it was, including table filters, opened `<details>`, diagram
    zoom and the graph's viewport; live refresh updates them too. An older tab is
    rebuilt from its address and scroll position when shown again; those finer states
    are then reset.
  - The tabs, their order, pins, the active tab and each tab's address and scroll
    position are saved per docs folder and restored at the next start (or only Home,
    if Settings → General says so); back/forward history is not saved. A link with an
    address opens in its own tab, or shows the tab that already has it. A saved tab
    whose doc has been removed says so and offers to close it.
- **Settings** (the gear on the rail, Ctrl/⌘+, or "Settings" in quick open), a dialog
  with sections:
  - **General:** the docs folder. In the desktop app: open another, recent folders,
    clone, reveal; in a browser it is shown read-only, since `pnpm start <folder>` sets
    it. What opens at start: the tabs from last time or Home.
  - **Appearance:** theme (light, dark or the system's), row density, sidebar grouping
    and wrapping in the Markdown view. Changes apply at once; diagrams and the graph
    follow the theme.
  - **Shortcuts:** see Keyboard shortcuts below.
  - **Git** (desktop app): how often to check for updates in the background.
  - **About:** the version, where settings are kept, and "Reset all settings".

  The viewer's settings are kept in the browser's storage for the page's address (in
  the desktop app, its own storage in the app's user data folder; the folder list,
  window and git settings are in `settings.json` there, shown under About). The desktop
  app keeps its port between runs so that storage stays the same; it is not copied
  into `settings.json`.

- **Sidebar:** the doc tree on every tab (on graph and health tabs it starts hidden; the
  choice to show or hide it is remembered for docs, the graph and health apart): pinned
  docs (when there are any), then the docs in groups that can be folded, each with its count:
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
  - The footer is the docs folder: its name and, in the desktop app, the git summary.
    Click it for the full path and Copy path, and in the desktop app the git details
    with Fetch and Pull, the branch (click it to switch branches) and the folder actions. Drag the
    sidebar's edge to resize it (or focus the edge and use the arrow keys;
    double-click resets it), and hide it with `[` or the button at the left of the top
    bar. Right-click a doc (or press the context-menu key) for Open, Open in new tab, Pin
    and Copy path. The width, the hidden state, the folded groups, the pins and the grouping are
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
- **Lineage graph** (`#/graph`, on the rail): see below. There, `/` focuses the
  find box.

The address is `#/doc/<repo-relative path>`, so back, forward and reload work. When a
Markdown file in the clone changes, the open page and the index refresh by themselves.

The server only reads Markdown files inside the clone (`GET /api/graph`,
`GET /api/doc?file=<repo-relative path>`, `GET /api/headings`); other paths, `.git` and anything outside the
clone are refused.

### Quick open

Ctrl+K (⌘K on macOS), or "Go to…" in the top bar or the rail, opens a search box over every dataset,
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

`?` lists them all with the keys in force. They do nothing while typing in a text field
(except quick open, and the tab and Settings shortcuts bound to Ctrl/⌘), while a dialog
or menu is open, or during input-method composition.

| Keys (browser)                         | Keys (desktop app)                           | Where      | Does                                                       |
| :------------------------------------- | :------------------------------------------- | :--------- | :--------------------------------------------------------- |
| Ctrl/⌘+K                               | Ctrl/⌘+K                                     | everywhere | quick open                                                 |
| Ctrl/⌘+,                               | Ctrl/⌘+,                                     | everywhere | Settings                                                   |
| `?`                                    | `?`                                          | everywhere | the list of shortcuts                                      |
| `/`                                    | `/`                                          | everywhere | focus the sidebar filter (the find box on graph or health) |
| `g` `d`, `g` `g`, `g` `h`              | the same                                     | everywhere | go to Docs, the lineage graph, Docs health                 |
| `]`                                    | `]`                                          | everywhere | show or hide the right-hand column or side panel           |
| Alt+T                                  | Ctrl/⌘+T                                     | tabs       | new tab (Home)                                             |
| Alt+W                                  | Ctrl/⌘+W                                     | tabs       | close the tab                                              |
| Alt+Shift+T                            | Ctrl/⌘+Shift+T                               | tabs       | reopen the last closed tab                                 |
| Alt+PgDn / Alt+PgUp, `g` `t` / `g` `T` | Ctrl+Tab / Ctrl+Shift+Tab, `g` `t` / `g` `T` | tabs       | next / previous tab                                        |
| Alt+1 … Alt+9                          | Ctrl/⌘+1 … Ctrl/⌘+9                          | tabs       | go to tab 1–8, 9 is the last                               |
| Alt+← / Alt+→                          | Alt+← / Alt+→ (macOS also ⌘[ / ⌘])           | tabs       | back / forward in the active tab                           |
| `[`                                    | `[`                                          | doc pages  | show or hide the sidebar                                   |
| `j` / `k`, Alt+↓ / Alt+↑               | the same                                     | doc pages  | next / previous doc in the sidebar's order                 |
| `t`                                    | `t`                                          | doc pages  | back to the top                                            |
| `m`                                    | `m`                                          | doc pages  | switch between the rendered page and its Markdown          |
| `f`, `0`                               | `f`, `0`                                     | graph      | fit to the window, actual size                             |

On macOS Alt is ⌥. A browser keeps Ctrl/⌘+T, W, Tab and 1–9 for itself, so the viewer's
tabs use Alt there; the desktop app has no browser tabs and uses the usual keys. Its menu
leaves Ctrl/⌘+W to the page (Close Window is Ctrl/⌘+Shift+W), so Ctrl/⌘+W closes a tab
and never the window.

**Changing shortcuts:** Settings → Shortcuts lists every shortcut above, grouped and
searchable. Click a key to replace it, or + to add another; then press one combination
(such as Alt+P), or two plain keys for a sequence (such as `g` then `x`). Enter keeps a
single plain key at once and Esc cancels; the keys pressed while recording do nothing
else. A key already used where the other shortcut also applies is reported, with
Replace (the other loses it), Swap (the other gets the old key) or Cancel. Refused, with
the reason: keys that move focus, scroll or edit (Tab, Enter, arrows, Space...),
Ctrl/⌘+C/V/X/A/Z, the operating system's own (app switching, the Windows key), the
browser's own in a browser, and the desktop menu's (Open Folder, Fetch, Pull, Switch Branch, reload,
zoom, Close Window) in the desktop app. A shortcut can be left with no keys. Each changed
shortcut has a reset button, and "Reset all to defaults" resets them all. Changes apply at
once, are saved, and show everywhere keys are shown (this list, tooltips, quick open,
the hints in the sidebar and the doc bar). A saved binding that cannot be read falls back
to the default for that shortcut only. The desktop menu's own accelerators are fixed.

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
